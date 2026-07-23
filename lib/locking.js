const moment = require('moment');
const debug = require('debug')('knex-migrator:locking');
const logging = require('@tryghost/logging');
const errors = require('./errors');
const database = require('./database');

const LOCK_KEY = 'km01';

// Default time the losing contender waits for an in-progress migration to
// finish before giving up. Overridable per-call or via env var so a
// multi-container deployment can tune it without a code change.
const DEFAULT_LOCK_WAIT_SECONDS = 30;

// Stashed on the knex instance by the MySQL advisory path so that unlock() can
// find the parked connection that owns the advisory lock.
const ADVISORY_STATE = Symbol.for('knex-migrator:advisory-lock');

/**
 * @description Resolve how long to wait for an in-progress migration.
 *
 * Precedence: `KNEX_MIGRATOR_LOCK_WAIT_SECONDS` env var → configured
 * `waitSeconds` (from `MigratorConfig.lockWaitSeconds`) → default. The env var
 * wins so a deployment can tune the wait per-container without rebuilding config.
 * Non-numeric / negative values are ignored and fall through to the next source.
 * @returns {number}
 */
function resolveWaitSeconds(options) {
    const candidates = [
        process.env.KNEX_MIGRATOR_LOCK_WAIT_SECONDS,
        options && options.waitSeconds,
    ];

    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null || candidate === '') {
            continue;
        }

        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }

    return DEFAULT_LOCK_WAIT_SECONDS;
}

/**
 * @description Build the `GET_LOCK` name.
 *
 * MySQL advisory-lock names are scoped to the whole server (shared across every
 * database on the host) and capped at 64 characters, so we namespace by the
 * database name to avoid two Ghost sites on one MySQL server serialising
 * against each other.
 * @returns {string}
 */
function advisoryLockName(connection) {
    let name = '';

    try {
        name = connection.client.config.connection.database || '';
    } catch {
        name = '';
    }

    return ('km_migration_' + (name || 'default')).slice(0, 64);
}

/**
 * @description Acquire the migration lock.
 *
 * On MySQL this holds a session-scoped advisory lock (`GET_LOCK`) that is
 * released automatically if the process dies, and waits (rather than throwing
 * immediately) for an in-progress migration to finish. On every other client
 * it keeps the historic row-based behaviour.
 *
 * @param {import('knex').Knex} connection
 * @param {Object} [options] - { waitSeconds }
 * @returns {Promise<*>}
 */
module.exports.lock = function lock(connection, options) {
    debug('Lock.');

    if (database.isMySQL(connection)) {
        return lockAdvisory(connection, options);
    }

    return lockRow(connection);
};

/**
 * @description MySQL advisory lock acquisition.
 *
 * 1. Park a dedicated connection and take a session-scoped `GET_LOCK`, blocking
 *    up to `waitSeconds` — this is the bounded wait-then-recheck.
 * 2. Holding the advisory lock proves no other process is *actively* migrating.
 *    Claim the persistent `migrations_lock` row. If it is still flagged locked,
 *    a previous holder died without releasing it (its advisory lock auto-released
 *    on disconnect): reclaim the row instead of bricking the database.
 * 3. Keep the parked connection open for the migration's lifetime.
 */
async function lockAdvisory(connection, options) {
    const waitSeconds = resolveWaitSeconds(options);
    const name = advisoryLockName(connection);

    let raw;
    let acquired = false;

    try {
        // Park a dedicated connection; the advisory lock lives on this session.
        raw = await database.acquireRawConnection(connection);

        // GET_LOCK(name, timeout): 1 = acquired, 0 = timed out, NULL = error.
        const rows = await database.rawQuery(raw, 'SELECT GET_LOCK(?, ?) AS acquired', [
            name,
            waitSeconds,
        ]);
        const result = rows && rows[0] ? Number(rows[0].acquired) : null;

        if (result !== 1) {
            throw new errors.MigrationsAreLockedError({
                message:
                    'Migrations are running at the moment. Please wait that the lock get`s released.',
                context: `Could not acquire the migration lock within ${waitSeconds}s — a parallel process is migrating.`,
                help: `If your database looks okay, inspect the lock with \`SELECT IS_USED_LOCK('${name}');\`.`,
            });
        }

        acquired = true;

        const lockRows = await connection('migrations_lock').where({
            lock_key: LOCK_KEY,
        });
        const row = lockRows && lockRows[0];

        if (row && row.locked) {
            logging.warn(
                'knex-migrator reclaimed a stale migration lock — a previous migration process ' +
                    'exited without releasing it. Continuing.',
            );
        }

        await connection('migrations_lock')
            .where({
                lock_key: LOCK_KEY,
            })
            .update({
                locked: 1,
                acquired_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            });

        // Park the connection + name so unlock() can release the advisory lock.
        connection[ADVISORY_STATE] = { raw, name };
    } catch (err) {
        await releaseAdvisory(connection, { raw, name }, acquired);

        if (errors.utils.isGhostError(err)) {
            throw err;
        }

        throw new errors.LockError({
            message: 'Error while acquire the migration lock.',
            err: err,
        });
    }
}

/**
 * @description Row-based lock acquisition (SQLite and any non-MySQL client).
 * Historic behaviour: throw immediately if the lock is already held.
 * @TODO: Locks in Sqlite won't work, because Sqlite doesn't offer read locks (https://github.com/TryGhost/knex-migrator/issues/87)
 */
function lockRow(connection) {
    return database.createTransaction(connection, async function (transacting) {
        try {
            const data = await transacting('migrations_lock')
                .where({
                    lock_key: LOCK_KEY,
                })
                .forUpdate();

            if (!data || !data.length || data[0].locked) {
                throw new errors.MigrationsAreLockedError({
                    message:
                        'Migrations are running at the moment. Please wait that the lock get`s released.',
                    context:
                        'Either the release was never released because of a e.g. died process or a parallel process is migrating at the moment.',
                    help: "If your database looks okay, you can manually release the lock by running `UPDATE migrations_lock set locked=0 where lock_key='km01';`.",
                });
            }

            return (transacting || connection)('migrations_lock')
                .where({
                    lock_key: LOCK_KEY,
                })
                .update({
                    locked: 1,
                    acquired_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                });
        } catch (err) {
            if (errors.utils.isGhostError(err)) {
                throw err;
            }

            throw new errors.LockError({
                message: 'Error while acquire the migration lock.',
                err: err,
            });
        }
    });
}

/**
 * @description Private helper to determine whether the database is locked or not.
 *
 * Intentionally reads the persistent `migrations_lock` row on every client: a
 * crashed migration leaves the row flagged (even though the MySQL advisory lock
 * auto-releases), which is what lets `rollback` detect a broken state and
 * recover.
 * @returns {boolean}
 */
module.exports.isLocked = async function isLocked(connection) {
    const data = await connection('migrations_lock').where({
        lock_key: LOCK_KEY,
    });

    if (!data || !data.length || data[0].locked) {
        throw new errors.MigrationsAreLockedError({
            message: 'Migration lock was never released or currently a migration is running.',
            help: 'If you are sure no migration is running, check your data and if your database is in a broken state, you could run `pnpm knex-migrator rollback`.',
        });
    }

    return false;
};

/**
 * @description Release the migration lock.
 *
 * Mirrors {@link module:locking.lock}: if the MySQL advisory path acquired the
 * lock, release both the persistent row and the parked advisory lock; otherwise
 * fall back to the historic row-based unlock.
 *
 * @param {import('knex').Knex} connection
 * @returns {Promise<*>}
 */
module.exports.unlock = function unlock(connection) {
    debug('Unlock.');

    const state = connection[ADVISORY_STATE];
    if (state) {
        return unlockAdvisory(connection, state);
    }

    return unlockRow(connection);
};

/**
 * @description Best-effort safety net that releases a still-held MySQL advisory
 * lock and hands its parked connection back.
 *
 * `unlock()` is the normal release path, but some commands acquire the lock and
 * legitimately never call it — e.g. `reset()` drops the whole database (and with
 * it the `migrations_lock` table) on success. Without this, the parked
 * connection returns to the pool still holding `GET_LOCK`, and every subsequent
 * migrator blocks until the wait timeout. Call this from each command's
 * `finally`, before destroying the connection: it is idempotent and a no-op once
 * `unlock()` has already run (or on the row-based/SQLite path), so it is always
 * safe to call. It never throws.
 *
 * @param {import('knex').Knex} connection
 * @returns {Promise<void>}
 */
module.exports.releaseAdvisoryLock = async function releaseAdvisoryLock(connection) {
    const state = connection && connection[ADVISORY_STATE];
    if (!state) {
        return;
    }

    // State is only ever set once GET_LOCK has succeeded, so treat it as acquired.
    await releaseAdvisory(connection, state, true);
};

/**
 * @description Release the persistent row and the parked advisory lock.
 */
async function unlockAdvisory(connection, state) {
    delete connection[ADVISORY_STATE];

    try {
        await connection('migrations_lock')
            .where({
                lock_key: LOCK_KEY,
            })
            .update({
                locked: 0,
                released_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            });
    } catch (err) {
        if (errors.utils.isGhostError(err)) {
            throw err;
        }

        throw new errors.UnlockError({
            message: 'Error while releasing the migration lock.',
            err: err,
        });
    } finally {
        // Always release the advisory lock and hand the connection back — even if
        // the row update above threw. Otherwise a still-locked connection returns
        // to the pool and the next GET_LOCK on it blocks until timeout. Cleanup
        // failures are swallowed so they cannot mask the original error.
        try {
            await database.rawQuery(state.raw, 'SELECT RELEASE_LOCK(?)', [state.name]);
        } catch {
            // Best effort: the lock also auto-releases when the connection closes.
        }

        try {
            await database.releaseRawConnection(connection, state.raw);
        } catch {
            // Best effort.
        }
    }
}

/**
 * @description Best-effort teardown of a partially/​fully acquired advisory lock
 * when acquisition fails.
 */
async function releaseAdvisory(connection, state, acquired) {
    delete connection[ADVISORY_STATE];

    // Acquiring the pooled connection itself failed — nothing to release.
    if (!state.raw) {
        return;
    }

    if (acquired) {
        try {
            await database.rawQuery(state.raw, 'SELECT RELEASE_LOCK(?)', [state.name]);
        } catch {
            // Best effort: the lock also auto-releases when we drop the connection.
        }
    }

    try {
        await database.releaseRawConnection(connection, state.raw);
    } catch {
        // Best effort.
    }
}

/**
 * @description Row-based unlock (SQLite and any non-MySQL client).
 * @TODO: Locks in Sqlite won't work, because Sqlite doesn't offer read locks (https://github.com/TryGhost/knex-migrator/issues/87)
 */
function unlockRow(connection) {
    return database.createTransaction(connection, async function (transacting) {
        try {
            const data = await transacting('migrations_lock')
                .where({
                    lock_key: LOCK_KEY,
                })
                .forUpdate();

            if (!data || !data.length || !data[0].locked) {
                throw new errors.MigrationsAreLockedError({
                    message: 'Migration lock was already released?.',
                });
            }

            return transacting('migrations_lock')
                .where({
                    lock_key: LOCK_KEY,
                })
                .update({
                    locked: 0,
                    released_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                });
        } catch (err) {
            if (errors.utils.isGhostError(err)) {
                throw err;
            }

            throw new errors.UnlockError({
                message: 'Error while releasing the migration lock.',
                err: err,
            });
        }
    });
}
