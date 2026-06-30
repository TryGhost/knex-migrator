const path = require('path');
const sinon = require('sinon');

const database = require('../../lib/database');
const errors = require('../../lib/errors');
const KnexMigrator = require('../../lib');
const utils = require('../../lib/utils');

function createKnexMigrator() {
    return new KnexMigrator({
        knexMigratorConfig: {
            database: {},
            migrationPath: path.join(__dirname, '..', 'assets', 'migrations'),
            currentVersion: '1.0'
        }
    });
}

function createDeleteChain() {
    return {
        where: sinon.stub().returns({
            delete: sinon.stub().resolves()
        })
    };
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
                    currentVersion: '1.0'
                }
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
                    currentVersion: '1.0'
                }
            });
            true.should.eql(false);
        } catch (err) {
            err.message.should.eql('MigratorConfig.js needs to export the location of your migration files.');
        }
    });

    it('requires a current version', function () {
        try {
            new KnexMigrator({
                knexMigratorConfig: {
                    database: {},
                    migrationPath: 'migrations'
                }
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
                version: '1.0'
            });
        });

        it('rejects duplicate migrations', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().resolves([{name: '1-test.js', version: '1.0'}]);

            return knexMigrator._beforeEach({
                task: '1-test.js',
                version: '1.0'
            }).then(function () {
                true.should.eql(false);
            }).catch(function (err) {
                err.should.be.instanceof(errors.MigrationExistsError);
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
                    transaction: true
                },
                up: sinon.stub().resolves()
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
                afterEach: sinon.stub().resolves()
            };

            return knexMigrator._migrateTo({
                version: '1.0',
                hooks: hooks
            }).then(function (result) {
                result.skippedTasks.should.eql([]);
                hooks.beforeEach.calledOnce.should.eql(true);
                hooks.afterEach.calledOnce.should.eql(true);
                task.up.calledWith({transacting: txn}).should.eql(true);
            });
        });

        it('skips existing migrations', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            sinon.stub(utils, 'readTasks').returns([{
                name: '1-test.js',
                up: sinon.stub().resolves()
            }]);
            sinon.stub(knexMigrator, '_beforeEach').rejects(new errors.MigrationExistsError());

            return knexMigrator._migrateTo({
                version: '1.0'
            }).then(function (result) {
                result.skippedTasks.should.eql(['1-test.js']);
            });
        });

        it('wraps long key errors with field-length guidance', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const err = new Error('Specified key was too long for index `table_name`.`idx_name`.`field_name`');
            err.code = 'ER_TOO_LONG_KEY';

            sinon.stub(utils, 'readTasks').returns([{
                name: '1-test.js',
                up: sinon.stub().rejects(err)
            }]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();

            return knexMigrator._migrateTo({
                version: '1.0'
            }).then(function () {
                true.should.eql(false);
            }).catch(function (wrappedErr) {
                wrappedErr.should.be.instanceof(errors.MigrationScriptError);
                wrappedErr.message.should.eql('Field length of `field_name` in `table_name` is too long!');
            });
        });

        it('runs only the requested task when only is set', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const skippedTask = {
                name: '1-test.js',
                up: sinon.stub().resolves()
            };
            const selectedTask = {
                name: '2-test.js',
                up: sinon.stub().resolves()
            };

            sinon.stub(utils, 'readTasks').returns([skippedTask, selectedTask]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();

            return knexMigrator._migrateTo({
                version: '1.0',
                only: 2
            }).then(function () {
                skippedTask.up.called.should.eql(false);
                selectedTask.up.calledOnce.should.eql(true);
            });
        });

        it('skips the requested task when skip is set', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = createDeleteChain;

            const skippedTask = {
                name: '1-test.js',
                up: sinon.stub().resolves()
            };
            const selectedTask = {
                name: '2-test.js',
                up: sinon.stub().resolves()
            };

            sinon.stub(utils, 'readTasks').returns([skippedTask, selectedTask]);
            sinon.stub(knexMigrator, '_beforeEach').resolves();
            sinon.stub(knexMigrator, '_afterEach').resolves();

            return knexMigrator._migrateTo({
                version: '1.0',
                skip: 1
            }).then(function () {
                skippedTask.up.called.should.eql(false);
                selectedTask.up.calledOnce.should.eql(true);
            });
        });
    });

    describe('_integrityCheck', function () {
        it('reports a missing target database', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({errno: 1046})
            });

            return knexMigrator._integrityCheck({}).then(function () {
                true.should.eql(false);
            }).catch(function (err) {
                err.should.be.instanceof(errors.DatabaseIsNotOkError);
                err.code.should.eql('DB_NOT_INITIALISED');
            });
        });

        it('reports a missing migrations table', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({
                    code: 'SQLITE_ERROR',
                    message: 'no such table: migrations'
                })
            });

            return knexMigrator._integrityCheck({}).then(function () {
                true.should.eql(false);
            }).catch(function (err) {
                err.should.be.instanceof(errors.DatabaseIsNotOkError);
                err.code.should.eql('MIGRATION_TABLE_IS_MISSING');
            });
        });

        it('reports a missing mysql database', function () {
            const knexMigrator = createKnexMigrator();
            knexMigrator.connection = sinon.stub().returns({
                select: sinon.stub().throws({errno: 1049})
            });

            return knexMigrator._integrityCheck({}).then(function () {
                true.should.eql(false);
            }).catch(function (err) {
                err.should.be.instanceof(errors.DatabaseIsNotOkError);
                err.code.should.eql('DB_NOT_INITIALISED');
            });
        });
    });
});
