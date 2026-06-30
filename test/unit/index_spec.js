const path = require('path');
const fs = require('fs');
const os = require('os');
const sinon = require('sinon');

const logging = require('@tryghost/logging');
const database = require('../../lib/database');
const errors = require('../../lib/errors');
const KnexMigrator = require('../../lib');
const locking = require('../../lib/locking');
const migrations = require('../../migrations');
const utils = require('../../lib/utils');

function createKnexMigrator() {
    return new KnexMigrator({
        knexMigratorConfig: {
            database: {},
            migrationPath: path.join(__dirname, '..', 'assets', 'migrations'),
            currentVersion: '1.0',
        },
    });
}

function createDeleteChain() {
    return {
        where: sinon.stub().returns({
            delete: sinon.stub().resolves(),
        }),
    };
}

function createDestroyableConnection() {
    const connection = sinon.stub();
    connection.destroy = sinon.stub().resolves();
    return connection;
}

describe('KnexMigrator', function () {
    afterEach(function () {
        sinon.restore();
    });

    it('requires a database config', function () {
        try {
            new KnexMigrator({
                knexMigratorConfig: {
                    migrationPath: 'migrations',
                    currentVersion: '1.0',
                },
            });
            true.should.eql(false);
        } catch (err) {
            err.message.should.eql('MigratorConfig.js needs to export a database config.');
        }
    });

    it('requires a migration path', function () {
        try {
            new KnexMigrator({
                knexMigratorConfig: {
                    database: {},
                    currentVersion: '1.0',
                },
            });
            true.should.eql(false);
        } catch (err) {
            err.message.should.eql(
                'MigratorConfig.js needs to export the location of your migration files.',
            );
        }
    });

    it('requires a current version', function () {
        try {
            new KnexMigrator({
                knexMigratorConfig: {
                    database: {},
                    migrationPath: 'migrations',
                },
            });
            true.should.eql(false);
        } catch (err) {
            err.message.should.eql('MigratorConfig.js needs to export the a current version.');
        }
    });

    describe('_beforeEach', function () {
        it('allows the first migration when no migrations are stored', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().resolves([]);

            return knexMigrator._beforeEach({
                task: '1-test.js',
                version: '1.0',
            });
        });

        it('rejects duplicate migrations', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon
                .stub()
                .resolves([{ name: '1-test.js', version: '1.0' }]);

            return knexMigrator
                ._beforeEach({
                    task: '1-test.js',
                    version: '1.0',
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationExistsError);
                });
        });

        it('allows a migration when stored migrations do not match', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon
                .stub()
                .resolves([{ name: '1-other.js', version: '1.0' }]);

            return knexMigrator._beforeEach({
                task: '1-test.js',
                version: '1.0',
            });
        });
    });

    describe('_migrateTo', function () {
        it('runs transactional tasks and hooks', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const task = {
                name: '1-test.js',
                config: {
                    transaction: true,
                },
                up: sinon.stub().resolves(),
            };
            const txn = {};

            sinon.stub(utils, 'readTasks').returns([task]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(txn);
            });

            const hooks = {
                beforeEach: sinon.stub().resolves(),
                afterEach: sinon.stub().resolves(),
            };

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                    hooks: hooks,
                })
                .then(function (result) {
                    result.skippedTasks.should.eql([]);
                    hooks.beforeEach.calledOnce.should.eql(true);
                    hooks.afterEach.calledOnce.should.eql(true);
                    task.up.calledWith({ transacting: txn }).should.eql(true);
                });
        });

        it('skips existing migrations', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            sinon.stub(utils, 'readTasks').returns([
                {
                    name: '1-test.js',
                    up: sinon.stub().resolves(),
                },
            ]);
            sinon.stub(knexMigrator, '_beforeEach').rejects(new errors.MigrationExistsError());

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                })
                .then(function (result) {
                    result.skippedTasks.should.eql(['1-test.js']);
                });
        });

        it('wraps long key errors with field-length guidance', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const err = new Error(
                'Specified key was too long for index `table_name`.`idx_name`.`field_name`',
            );
            err.code = 'ER_TOO_LONG_KEY';

            sinon.stub(utils, 'readTasks').returns([
                {
                    name: '1-test.js',
                    up: sinon.stub().rejects(err),
                },
            ]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (wrappedErr) {
                    wrappedErr.should.be.instanceof(errors.MigrationScriptError);
                    wrappedErr.message.should.eql(
                        'Field length of `field_name` in `table_name` is too long!',
                    );
                });
        });

        it('runs only the requested task when only is set', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const skippedTask = {
                name: '1-test.js',
                up: sinon.stub().resolves(),
            };
            const selectedTask = {
                name: '2-test.js',
                up: sinon.stub().resolves(),
            };

            sinon.stub(utils, 'readTasks').returns([skippedTask, selectedTask]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                    only: 2,
                })
                .then(function () {
                    skippedTask.up.called.should.eql(false);
                    selectedTask.up.calledOnce.should.eql(true);
                });
        });

        it('skips the requested task when skip is set', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const skippedTask = {
                name: '1-test.js',
                up: sinon.stub().resolves(),
            };
            const selectedTask = {
                name: '2-test.js',
                up: sinon.stub().resolves(),
            };

            sinon.stub(utils, 'readTasks').returns([skippedTask, selectedTask]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                    skip: 1,
                })
                .then(function () {
                    skippedTask.up.called.should.eql(false);
                    selectedTask.up.calledOnce.should.eql(true);
                });
        });

        it('runs non-transactional tasks without hooks', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const task = {
                name: '1-test.js',
                up: sinon.stub().resolves(),
            };

            sinon.stub(utils, 'readTasks').returns([task]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                })
                .then(function () {
                    task.up.calledWith({ connection: knexMigrator.connection }).should.eql(true);
                });
        });

        it('throws non-migration-path errors when init tasks cannot be read', function () {
            const knexMigrator = createKnexMigrator();
            const err = new Error('permission denied');
            err.code = 'EACCES';

            sinon.stub(utils, 'readTasks').throws(err);

            (function () {
                knexMigrator._migrateTo({ version: 'init' });
            }).should.throw('permission denied');
        });

        it('wraps generic migration script errors', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            sinon.stub(utils, 'readTasks').returns([
                {
                    name: '1-test.js',
                    up: sinon.stub().rejects(new Error('boom')),
                },
            ]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();

            return knexMigrator
                ._migrateTo({
                    version: '1.0',
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationScriptError);
                    err.message.should.eql('boom');
                });
        });
    });

    describe('_integrityCheck', function () {
        it('reports a missing target database', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({ errno: 1046 }),
            });

            return knexMigrator
                ._integrityCheck({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.DatabaseIsNotOkError);
                    err.code.should.eql('DB_NOT_INITIALISED');
                });
        });

        it('reports a missing migrations table', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({
                    code: 'SQLITE_ERROR',
                    message: 'no such table: migrations',
                }),
            });

            return knexMigrator
                ._integrityCheck({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.DatabaseIsNotOkError);
                    err.code.should.eql('MIGRATION_TABLE_IS_MISSING');
                });
        });

        it('reports a missing mysql database', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({ errno: 1049 }),
            });

            return knexMigrator
                ._integrityCheck({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.DatabaseIsNotOkError);
                    err.code.should.eql('DB_NOT_INITIALISED');
                });
        });

        it('ignores unparsable migration folders', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().returns({
                    count: sinon.stub().returns({
                        groupBy: sinon.stub().resolves([]),
                    }),
                }),
            });

            sinon.stub(utils, 'readVersionFolders').returns(['not-a-version']);
            sinon.stub(utils, 'listFiles').returns([]);

            return knexMigrator._integrityCheck({ force: true }).then(function (result) {
                result.should.eql({
                    init: {
                        expected: 0,
                        actual: 0,
                    },
                });
            });
        });

        it('keeps future versions that already match the database state', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().returns({
                    count: sinon.stub().returns({
                        groupBy: sinon.stub().resolves([{ version: '1.1', c: 1 }]),
                    }),
                }),
            });

            sinon.stub(utils, 'readVersionFolders').returns(['1.1']);
            sinon.stub(utils, 'listFiles').returns(['1-test.js']);

            return knexMigrator._integrityCheck().then(function (result) {
                result['1.1'].should.eql({
                    expected: 1,
                    actual: 1,
                });
            });
        });
    });

    describe('migrate', function () {
        function assertMigratePassesThroughProtectedError(err) {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').resolves();
            sinon.stub(locking, 'unlock').resolves();
            sinon.stub(knexMigrator, '_integrityCheck').resolves({
                1.1: {
                    expected: 1,
                    actual: 0,
                },
            });
            sinon.stub(knexMigrator, '_migrateTo').rejects(err);
            sinon.stub(knexMigrator, '_rollback').resolves();

            return knexMigrator
                .migrate()
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (caughtErr) {
                    caughtErr.should.eql(err);
                    knexMigrator._rollback.called.should.eql(false);
                    locking.unlock.called.should.eql(false);
                    connection.destroy.calledOnce.should.eql(true);
                });
        }

        it('ignores the only option when no version is requested', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').resolves();
            sinon.stub(locking, 'unlock').resolves();
            sinon.stub(knexMigrator, '_integrityCheck').resolves({});
            sinon.stub(knexMigrator, '_migrateTo').resolves();

            return knexMigrator
                .migrate({
                    only: 1,
                })
                .then(function () {
                    knexMigrator._migrateTo.called.should.eql(false);
                    locking.unlock.calledOnce.should.eql(true);
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('warns when the requested version is not present', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').resolves();
            sinon.stub(locking, 'unlock').resolves();
            sinon.stub(logging, 'warn');
            sinon.stub(knexMigrator, '_migrateTo').resolves();
            sinon.stub(knexMigrator, '_integrityCheck').resolves({
                1.1: {
                    expected: 1,
                    actual: 1,
                },
            });

            return knexMigrator
                .migrate({
                    version: '1.2',
                })
                .then(function () {
                    locking.unlock.calledOnce.should.eql(true);
                    logging.warn.calledWith('Cannot find requested version: 1.2').should.eql(true);
                    knexMigrator._migrateTo.called.should.eql(false);
                });
        });

        it('runs migrate hooks around selected migrations', function () {
            const migrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'km-hooks-'));
            const hooksPath = path.join(migrationRoot, 'hooks');
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            fs.mkdirSync(hooksPath);
            fs.writeFileSync(
                path.join(hooksPath, 'migrate.js'),
                [
                    'module.exports.before = function before() { global.__kmBeforeHook += 1; return Promise.resolve(); };',
                    'module.exports.after = function after() { global.__kmAfterHook += 1; return Promise.resolve(); };',
                    'module.exports.shutdown = function shutdown() { global.__kmShutdownHook += 1; return Promise.resolve(); };',
                ].join('\n'),
            );

            global.__kmBeforeHook = 0;
            global.__kmAfterHook = 0;
            global.__kmShutdownHook = 0;
            knexMigrator.migrationPath = migrationRoot;

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').resolves();
            sinon.stub(locking, 'unlock').resolves();
            sinon.stub(knexMigrator, '_integrityCheck').resolves({
                1.1: {
                    expected: 1,
                    actual: 0,
                },
            });
            sinon.stub(knexMigrator, '_migrateTo').resolves();

            return knexMigrator
                .migrate()
                .then(function () {
                    global.__kmBeforeHook.should.eql(1);
                    global.__kmAfterHook.should.eql(1);
                    global.__kmShutdownHook.should.eql(1);
                })
                .finally(function () {
                    delete global.__kmBeforeHook;
                    delete global.__kmAfterHook;
                    delete global.__kmShutdownHook;
                    fs.rmSync(migrationRoot, { recursive: true, force: true });
                });
        });

        it('passes through migration lock errors without rollback', function () {
            return assertMigratePassesThroughProtectedError(new errors.MigrationsAreLockedError());
        });

        it('passes through lock errors without rollback', function () {
            return assertMigratePassesThroughProtectedError(new errors.LockError());
        });

        it('passes through database errors without rollback', function () {
            return assertMigratePassesThroughProtectedError(new errors.DatabaseError());
        });
    });

    describe('reset', function () {
        it('ignores missing mysql databases when force resetting', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'drop').rejects({ errno: 1049 });

            return knexMigrator
                .reset({
                    force: true,
                })
                .then(function () {
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('does not unlock when reset fails because migrations are locked', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();
            const err = new errors.MigrationsAreLockedError();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').rejects(err);
            sinon.stub(locking, 'unlock').resolves();

            return knexMigrator
                .reset()
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (caughtErr) {
                    caughtErr.should.eql(err);
                    locking.unlock.called.should.eql(false);
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('does not unlock when reset fails because of a database error', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();
            const err = new errors.DatabaseError();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').rejects(err);
            sinon.stub(locking, 'unlock').resolves();

            return knexMigrator
                .reset()
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (caughtErr) {
                    caughtErr.should.eql(err);
                    locking.unlock.called.should.eql(false);
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('ignores missing mysql databases after locking during reset', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'lock').resolves();
            sinon.stub(locking, 'unlock').resolves();
            sinon.stub(database, 'drop').rejects({ errno: 1049 });

            return knexMigrator.reset().then(function () {
                locking.unlock.called.should.eql(false);
                connection.destroy.calledOnce.should.eql(true);
            });
        });
    });

    describe('isDatabaseOK', function () {
        it('reports when there are more migrations than files', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'isLocked').resolves();
            sinon.stub(knexMigrator, '_integrityCheck').resolves({
                init: {
                    expected: 1,
                    actual: 1,
                },
                '1.0': {
                    expected: 1,
                    actual: 2,
                },
            });

            return knexMigrator
                .isDatabaseOK()
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.DatabaseIsNotOkError);
                    err.code.should.eql('MIGRATION_STATE_ERROR');
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('reports uninitialized mysql databases', function () {
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').rejects({ errno: 1049 });

            return knexMigrator
                .isDatabaseOK()
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.DatabaseIsNotOkError);
                    err.code.should.eql('DB_NOT_INITIALISED');
                    connection.destroy.calledOnce.should.eql(true);
                });
        });
    });

    describe('rollback', function () {
        it('runs init hooks when forcing rollback', function () {
            const migrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'km-rollback-hooks-'));
            const hooksPath = path.join(migrationRoot, 'hooks');
            const knexMigrator = createKnexMigrator();
            const connection = createDestroyableConnection();

            connection.returns({
                where: sinon.stub().returns(
                    Promise.resolve([
                        {
                            name: '1-test.js',
                            version: '1.1',
                        },
                    ]),
                ),
            });

            fs.mkdirSync(hooksPath);
            fs.writeFileSync(
                path.join(hooksPath, 'init.js'),
                [
                    'module.exports.before = function before() { global.__kmRollbackBeforeHook += 1; return Promise.resolve(); };',
                    'module.exports.shutdown = function shutdown() { global.__kmRollbackShutdownHook += 1; return Promise.resolve(); };',
                ].join('\n'),
            );

            global.__kmRollbackBeforeHook = 0;
            global.__kmRollbackShutdownHook = 0;
            knexMigrator.migrationPath = migrationRoot;

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();
            sinon.stub(migrations, 'run').resolves();
            sinon.stub(locking, 'isLocked').resolves();
            sinon.stub(knexMigrator, '_rollback').resolves();

            return knexMigrator
                .rollback({
                    force: true,
                })
                .then(function () {
                    global.__kmRollbackBeforeHook.should.eql(1);
                    global.__kmRollbackShutdownHook.should.eql(1);
                    knexMigrator._rollback
                        .calledWith({
                            version: '1.1',
                            onlyTasks: ['1-test.js'],
                        })
                        .should.eql(true);
                })
                .finally(function () {
                    delete global.__kmRollbackBeforeHook;
                    delete global.__kmRollbackShutdownHook;
                    fs.rmSync(migrationRoot, { recursive: true, force: true });
                });
        });
    });
});
