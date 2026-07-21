const sinon = require('sinon');
const logging = require('@tryghost/logging');

const database = require('../../lib/database');
const errors = require('../../lib/errors');
const locking = require('../../lib/locking');

// Mirrors the symbol lib/locking.js parks the advisory-lock state under.
const ADVISORY_STATE = Symbol.for('knex-migrator:advisory-lock');

function createLockTable(data) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().returns({
                    then: function (callback) {
                        return Promise.resolve(data).then(callback);
                    },
                }),
            }),
        };
    };
}

function createUpdatableLockTable(data, update) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().resolves(data),
                update: update,
            }),
        };
    };
}

function createRejectedLockTable(err) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().returns(Promise.reject(err)),
            }),
        };
    };
}

/**
 * Builds a knex-instance stub for the MySQL advisory path. `connection('migrations_lock')`
 * returns a builder whose `.where()` result is both awaitable (resolves the SELECT
 * rows) and exposes `.update()`.
 */
function createAdvisoryConnection(options) {
    options = options || {};
    const selectRows = options.selectRows || [{ locked: 0 }];
    const update = sinon.stub();
    if (options.updateRejects) {
        update.rejects(options.updateRejects);
    } else {
        update.resolves(1);
    }

    const where = sinon.stub().returns({
        update,
        then: function (resolve, reject) {
            return Promise.resolve(selectRows).then(resolve, reject);
        },
    });

    const connection = sinon.stub().returns({ where });
    connection.client = { config: { connection: { database: 'ghost_test' } } };

    return { connection, where, update };
}

describe('Locking', function () {
    afterEach(function () {
        sinon.restore();
        delete process.env.KNEX_MIGRATOR_LOCK_WAIT_SECONDS;
    });

    describe('lock (row-based / non-MySQL)', function () {
        it('rejects when the migration lock row is missing', function () {
            sinon.stub(database, 'isMySQL').returns(false);
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createLockTable([]));
            });

            return locking
                .lock({})
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.MigrationsAreLockedError);
                });
        });

        it('wraps unexpected lock acquisition errors', function () {
            sinon.stub(database, 'isMySQL').returns(false);
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createRejectedLockTable(new Error('driver failed')));
            });

            return locking
                .lock({})
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.LockError);
                    expect(err.message).toEqual('Error while acquire the migration lock.');
                });
        });

        it('stores acquired_at as a local timestamp', async function () {
            sinon.useFakeTimers({ now: new Date(2026, 0, 2, 3, 4, 5), toFake: ['Date'] });
            const update = sinon.stub().resolves(1);

            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createUpdatableLockTable([{ locked: 0 }], update));
            });

            await locking.lock({});

            expect(update.firstCall.args[0]).toEqual({
                locked: 1,
                acquired_at: '2026-01-02 03:04:05',
            });
        });
    });

    describe('lock (MySQL advisory)', function () {
        it('takes GET_LOCK, flags the row, and parks the connection', async function () {
            const raw = { id: 'raw-conn' };
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves(raw);
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection, update } = createAdvisoryConnection();

            await locking.lock(connection);

            // GET_LOCK invoked with a db-namespaced name and the default 30s wait.
            expect(rawQuery.calledOnce).toEqual(true);
            expect(rawQuery.firstCall.args[1]).toEqual('SELECT GET_LOCK(?, ?) AS acquired');
            expect(rawQuery.firstCall.args[2]).toEqual(['km_migration_ghost_test', 30]);

            // Persistent row flagged locked=1.
            expect(update.calledOnce).toEqual(true);
            expect(update.firstCall.args[0].locked).toEqual(1);

            // Parked connection retained for unlock(); NOT released.
            expect(releaseRaw.called).toEqual(false);
            expect(connection[ADVISORY_STATE].raw).toBe(raw);
        });

        it('waits then throws MigrationsAreLockedError when GET_LOCK times out', async function () {
            const raw = { id: 'raw-conn' };
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves(raw);
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            sinon.stub(database, 'rawQuery').resolves([{ acquired: 0 }]);

            const { connection, update } = createAdvisoryConnection();

            let caught;
            try {
                await locking.lock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.MigrationsAreLockedError);
            // Never touched the row, and handed the parked connection back.
            expect(update.called).toEqual(false);
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
        });

        it('wraps a pooled-connection acquisition failure as LockError', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').rejects(new Error('pool exhausted'));
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();

            const { connection } = createAdvisoryConnection();

            let caught;
            try {
                await locking.lock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.LockError);
            // Nothing was acquired, so there is nothing to release.
            expect(rawQuery.called).toEqual(false);
            expect(releaseRaw.called).toEqual(false);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
        });

        it('throws MigrationsAreLockedError when the lock row is missing', async function () {
            const raw = { id: 'raw-conn' };
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves(raw);
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            // No migrations_lock row to claim.
            const { connection, update } = createAdvisoryConnection({ selectRows: [] });

            let caught;
            try {
                await locking.lock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.MigrationsAreLockedError);
            // Never claims success without a persisted lock record.
            expect(update.called).toEqual(false);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
            // GET_LOCK succeeded, so it must be released again.
            expect(rawQuery.secondCall.args[1]).toEqual('SELECT RELEASE_LOCK(?)');
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
        });

        it('treats a NULL GET_LOCK result as a database error, not contention', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            sinon.stub(database, 'rawQuery').resolves([{ acquired: null }]);

            const { connection } = createAdvisoryConnection();

            let caught;
            try {
                await locking.lock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.LockError);
            expect(caught).not.toBeInstanceOf(errors.MigrationsAreLockedError);
            expect(releaseRaw.called).toEqual(true);
        });

        it('reclaims a stale row lock and warns', async function () {
            const warn = sinon.stub(logging, 'warn');
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            // Row still flagged locked from a previous, crashed migration.
            const { connection, update } = createAdvisoryConnection({
                selectRows: [{ locked: 1 }],
            });

            await locking.lock(connection);

            expect(warn.calledOnce).toEqual(true);
            expect(warn.firstCall.args[0]).toMatch(/stale migration lock/);
            expect(update.firstCall.args[0].locked).toEqual(1);
        });

        it('uses the configured waitSeconds when no env var is set', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection();

            await locking.lock(connection, { waitSeconds: 12 });

            expect(rawQuery.firstCall.args[2]).toEqual(['km_migration_ghost_test', 12]);
        });

        it('lets KNEX_MIGRATOR_LOCK_WAIT_SECONDS override the configured value', async function () {
            process.env.KNEX_MIGRATOR_LOCK_WAIT_SECONDS = '5';
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection();

            // env (5) beats the configured 12.
            await locking.lock(connection, { waitSeconds: 12 });

            expect(rawQuery.firstCall.args[2]).toEqual(['km_migration_ghost_test', 5]);
        });

        it('falls back to the 30s default when neither is set', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection();

            await locking.lock(connection, { waitSeconds: undefined });

            expect(rawQuery.firstCall.args[2]).toEqual(['km_migration_ghost_test', 30]);
        });

        it('releases the advisory lock and wraps row-update failures as LockError', async function () {
            const raw = { id: 'raw-conn' };
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves(raw);
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection({
                updateRejects: new Error('write failed'),
            });

            let caught;
            try {
                await locking.lock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.LockError);
            // RELEASE_LOCK issued (GET_LOCK + RELEASE_LOCK == 2 calls) and connection returned.
            expect(rawQuery.callCount).toEqual(2);
            expect(rawQuery.secondCall.args[1]).toEqual('SELECT RELEASE_LOCK(?)');
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
        });
    });

    describe('isLocked', function () {
        it('returns false when the lock is released', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 0 }]),
            });

            return locking.isLocked(connection).then(function (result) {
                expect(result).toEqual(false);
            });
        });

        it('rejects when the lock row is locked', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 1 }]),
            });

            return locking
                .isLocked(connection)
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.MigrationsAreLockedError);
                });
        });
    });

    describe('unlock (row-based / non-MySQL)', function () {
        it('stores released_at as a local timestamp', async function () {
            sinon.useFakeTimers({ now: new Date(2026, 10, 12, 13, 14, 15), toFake: ['Date'] });
            const update = sinon.stub().resolves(1);

            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createUpdatableLockTable([{ locked: 1 }], update));
            });

            await locking.unlock({});

            expect(update.firstCall.args[0]).toEqual({
                locked: 0,
                released_at: '2026-11-12 13:14:15',
            });
        });

        it('rejects when the migration lock row is already released', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createLockTable([{ locked: 0 }]));
            });

            return locking
                .unlock({})
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.MigrationsAreLockedError);
                });
        });

        it('wraps unexpected unlock errors', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createRejectedLockTable(new Error('driver failed')));
            });

            return locking
                .unlock({})
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.UnlockError);
                    expect(err.message).toEqual('Error while releasing the migration lock.');
                });
        });
    });

    describe('unlock (MySQL advisory)', function () {
        it('clears the row, runs RELEASE_LOCK, and returns the parked connection', async function () {
            const raw = { id: 'raw-conn' };
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{}]);

            const { connection, update } = createAdvisoryConnection();
            connection[ADVISORY_STATE] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            await locking.unlock(connection);

            // Row cleared to locked=0.
            expect(update.calledOnce).toEqual(true);
            expect(update.firstCall.args[0].locked).toEqual(0);

            // RELEASE_LOCK on the parked session, then hand it back, then forget it.
            expect(rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)')).toEqual(true);
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
        });

        it('releases the advisory lock and returns the connection even when the row update fails', async function () {
            const raw = { id: 'raw-conn' };
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();

            const { connection } = createAdvisoryConnection({
                updateRejects: new Error('write failed'),
            });
            connection[ADVISORY_STATE] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            let caught;
            try {
                await locking.unlock(connection);
            } catch (err) {
                caught = err;
            }

            expect(caught).toBeInstanceOf(errors.UnlockError);
            // Critically: RELEASE_LOCK still runs so a locked connection is never
            // returned to the pool, then the connection is handed back.
            expect(rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)')).toEqual(true);
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
        });
    });

    describe('releaseAdvisoryLock', function () {
        it('is a no-op when no advisory lock is parked', async function () {
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();

            await locking.releaseAdvisoryLock(sinon.stub());

            expect(rawQuery.called).toEqual(false);
            expect(releaseRaw.called).toEqual(false);
        });

        it('tolerates a null connection', async function () {
            await locking.releaseAdvisoryLock(null);
            await locking.releaseAdvisoryLock(undefined);
        });

        it('releases RELEASE_LOCK, returns the connection, and clears the state', async function () {
            const raw = { id: 'raw-conn' };
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();

            const connection = sinon.stub();
            connection[ADVISORY_STATE] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            await locking.releaseAdvisoryLock(connection);

            expect(rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)')).toEqual(true);
            expect(releaseRaw.calledOnceWith(connection, raw)).toEqual(true);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
        });

        it('never throws, even when RELEASE_LOCK fails', async function () {
            sinon.stub(database, 'rawQuery').rejects(new Error('gone'));
            sinon.stub(database, 'releaseRawConnection').resolves();

            const connection = sinon.stub();
            connection[ADVISORY_STATE] = {
                raw: {},
                name: 'km_migration_ghost_test',
            };

            // Should resolve, not reject.
            await locking.releaseAdvisoryLock(connection);
            expect(connection[ADVISORY_STATE] === undefined).toEqual(true);
        });
    });
});
