const sinon = require('sinon');
const logging = require('@tryghost/logging');

const database = require('../../lib/database');
const errors = require('../../lib/errors');
const locking = require('../../lib/locking');

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
    const update = sinon.stub().resolves(options.updateRejects ? undefined : 1);
    if (options.updateRejects) {
        update.rejects(options.updateRejects);
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
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
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
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.LockError);
                    err.message.should.eql('Error while acquire the migration lock.');
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
            rawQuery.calledOnce.should.eql(true);
            rawQuery.firstCall.args[1].should.eql('SELECT GET_LOCK(?, ?) AS acquired');
            rawQuery.firstCall.args[2].should.eql(['km_migration_ghost_test', 30]);

            // Persistent row flagged locked=1.
            update.calledOnce.should.eql(true);
            update.firstCall.args[0].locked.should.eql(1);

            // Parked connection retained for unlock(); NOT released.
            releaseRaw.called.should.eql(false);
            connection[Symbol.for('knex-migrator:advisory-lock')].raw.should.equal(raw);
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

            caught.should.be.instanceof(errors.MigrationsAreLockedError);
            // Never touched the row, and handed the parked connection back.
            update.called.should.eql(false);
            releaseRaw.calledOnceWith(connection, raw).should.eql(true);
            (connection[Symbol.for('knex-migrator:advisory-lock')] === undefined).should.eql(true);
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

            caught.should.be.instanceof(errors.LockError);
            // Nothing was acquired, so there is nothing to release.
            rawQuery.called.should.eql(false);
            releaseRaw.called.should.eql(false);
            (connection[Symbol.for('knex-migrator:advisory-lock')] === undefined).should.eql(true);
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

            warn.calledOnce.should.eql(true);
            warn.firstCall.args[0].should.match(/stale migration lock/);
            update.firstCall.args[0].locked.should.eql(1);
        });

        it('uses the configured waitSeconds when no env var is set', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection();

            await locking.lock(connection, { waitSeconds: 12 });

            rawQuery.firstCall.args[2].should.eql(['km_migration_ghost_test', 12]);
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

            rawQuery.firstCall.args[2].should.eql(['km_migration_ghost_test', 5]);
        });

        it('falls back to the 30s default when neither is set', async function () {
            sinon.stub(database, 'isMySQL').returns(true);
            sinon.stub(database, 'acquireRawConnection').resolves({});
            sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{ acquired: 1 }]);

            const { connection } = createAdvisoryConnection();

            await locking.lock(connection, { waitSeconds: undefined });

            rawQuery.firstCall.args[2].should.eql(['km_migration_ghost_test', 30]);
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

            caught.should.be.instanceof(errors.LockError);
            // RELEASE_LOCK issued (GET_LOCK + RELEASE_LOCK == 2 calls) and connection returned.
            rawQuery.callCount.should.eql(2);
            rawQuery.secondCall.args[1].should.eql('SELECT RELEASE_LOCK(?)');
            releaseRaw.calledOnceWith(connection, raw).should.eql(true);
        });
    });

    describe('isLocked', function () {
        it('returns false when the lock is released', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 0 }]),
            });

            return locking.isLocked(connection).then(function (result) {
                result.should.eql(false);
            });
        });

        it('rejects when the lock row is locked', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 1 }]),
            });

            return locking
                .isLocked(connection)
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
                });
        });
    });

    describe('unlock (row-based / non-MySQL)', function () {
        it('rejects when the migration lock row is already released', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createLockTable([{ locked: 0 }]));
            });

            return locking
                .unlock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
                });
        });

        it('wraps unexpected unlock errors', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createRejectedLockTable(new Error('driver failed')));
            });

            return locking
                .unlock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.UnlockError);
                    err.message.should.eql('Error while releasing the migration lock.');
                });
        });
    });

    describe('unlock (MySQL advisory)', function () {
        it('clears the row, runs RELEASE_LOCK, and returns the parked connection', async function () {
            const raw = { id: 'raw-conn' };
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves([{}]);

            const { connection, update } = createAdvisoryConnection();
            connection[Symbol.for('knex-migrator:advisory-lock')] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            await locking.unlock(connection);

            // Row cleared to locked=0.
            update.calledOnce.should.eql(true);
            update.firstCall.args[0].locked.should.eql(0);

            // RELEASE_LOCK on the parked session, then hand it back, then forget it.
            rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)').should.eql(true);
            releaseRaw.calledOnceWith(connection, raw).should.eql(true);
            (connection[Symbol.for('knex-migrator:advisory-lock')] === undefined).should.eql(true);
        });

        it('releases the advisory lock and returns the connection even when the row update fails', async function () {
            const raw = { id: 'raw-conn' };
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();

            const { connection } = createAdvisoryConnection({
                updateRejects: new Error('write failed'),
            });
            connection[Symbol.for('knex-migrator:advisory-lock')] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            let caught;
            try {
                await locking.unlock(connection);
            } catch (err) {
                caught = err;
            }

            caught.should.be.instanceof(errors.UnlockError);
            // Critically: RELEASE_LOCK still runs so a locked connection is never
            // returned to the pool, then the connection is handed back.
            rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)').should.eql(true);
            releaseRaw.calledOnceWith(connection, raw).should.eql(true);
        });
    });

    describe('releaseAdvisoryLock', function () {
        it('is a no-op when no advisory lock is parked', async function () {
            const rawQuery = sinon.stub(database, 'rawQuery').resolves();
            const releaseRaw = sinon.stub(database, 'releaseRawConnection').resolves();

            await locking.releaseAdvisoryLock(sinon.stub());

            rawQuery.called.should.eql(false);
            releaseRaw.called.should.eql(false);
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
            connection[Symbol.for('knex-migrator:advisory-lock')] = {
                raw,
                name: 'km_migration_ghost_test',
            };

            await locking.releaseAdvisoryLock(connection);

            rawQuery.calledOnceWith(raw, 'SELECT RELEASE_LOCK(?)').should.eql(true);
            releaseRaw.calledOnceWith(connection, raw).should.eql(true);
            (connection[Symbol.for('knex-migrator:advisory-lock')] === undefined).should.eql(true);
        });

        it('never throws, even when RELEASE_LOCK fails', async function () {
            sinon.stub(database, 'rawQuery').rejects(new Error('gone'));
            sinon.stub(database, 'releaseRawConnection').resolves();

            const connection = sinon.stub();
            connection[Symbol.for('knex-migrator:advisory-lock')] = {
                raw: {},
                name: 'km_migration_ghost_test',
            };

            // Should resolve, not reject.
            await locking.releaseAdvisoryLock(connection);
            (connection[Symbol.for('knex-migrator:advisory-lock')] === undefined).should.eql(true);
        });
    });
});
