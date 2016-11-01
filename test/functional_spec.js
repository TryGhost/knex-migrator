var KnexMigrator = require('../lib'),
    errors = require('../lib/errors'),
    knex = require('knex'),
    sinon = require('sinon'),
    sandbox = sinon.sandbox.create(),
    should = require('should'),
    fs = require('fs');

describe.only('Functional flow test', function () {
    var knexMigrator,
        dbFile = __dirname + '/assets/test.db',
        migrationsv13 = __dirname + '/assets/migrations/1.3',
        migrationsv14 = __dirname + '/assets/migrations/1.4',
        migrationsv13File = __dirname + '/assets/migrations/1.3/1-delete-user.js',
        migrationsv14File1 = __dirname + '/assets/migrations/1.4/1-no-error.js',
        migrationsv14File2 = __dirname + '/assets/migrations/1.4/2-error.js',
        connection;

    before(function () {
        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        if (fs.existsSync(migrationsv13File)) {
            fs.unlinkSync(migrationsv13File);
        }

        if (fs.existsSync(migrationsv13)) {
            fs.rmdirSync(migrationsv13);
        }

        if (fs.existsSync(migrationsv14File1)) {
            fs.unlinkSync(migrationsv14File1);
        }

        if (fs.existsSync(migrationsv14File2)) {
            fs.unlinkSync(migrationsv14File2);
        }

        if (fs.existsSync(migrationsv14)) {
            fs.rmdirSync(migrationsv14);
        }
    });

    before(function () {
        connection = knex({
            client: 'sqlite3',
            connection: {
                filename: dbFile
            },
            useNullAsDefault: true
        });

        knexMigrator = new KnexMigrator({
            knexMigratorFilePath: __dirname + '/assets'
        });
    });

    after(function (done) {
        connection && connection.destroy(done);

        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        if (fs.existsSync(migrationsv13File)) {
            fs.unlinkSync(migrationsv13File);
        }

        if (fs.existsSync(migrationsv13)) {
            fs.rmdirSync(migrationsv13);
        }

        if (fs.existsSync(migrationsv14File1)) {
            fs.unlinkSync(migrationsv14File1);
        }

        if (fs.existsSync(migrationsv14File2)) {
            fs.unlinkSync(migrationsv14File2);
        }

        if (fs.existsSync(migrationsv14)) {
            fs.rmdirSync(migrationsv14);
        }
    });

    beforeEach(function () {
        sandbox.spy(knexMigrator, 'beforeEachTask');
        sandbox.spy(knexMigrator, 'afterEachTask');
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('is database ok? --> no', function () {
        return knexMigrator.isDatabaseOK()
            .then(function () {
                throw new Error('Database should be NOT ok!')
            })
            .catch(function (err) {
                should.exist(err);
                (err instanceof errors.DatabaseIsNotOkError);
                err.code.should.eql('DB_NOT_INITIALISED');
            });
    });

    it('init', function () {
        return knexMigrator.init()
            .then(function () {
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(1);
                values[0].name.should.eql('Hausweib');

                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(2);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                knexMigrator.beforeEachTask.called.should.eql(true);
                knexMigrator.beforeEachTask.callCount.should.eql(2);

                knexMigrator.afterEachTask.called.should.eql(true);
                knexMigrator.afterEachTask.callCount.should.eql(2);
            })
    });

    it('is database ok? --> no', function () {
        return knexMigrator.isDatabaseOK()
            .then(function () {
                throw new Error('Database should be NOT ok!')
            })
            .catch(function (err) {
                should.exist(err);
                (err instanceof errors.DatabaseIsNotOkError);
                err.code.should.eql('DB_NEEDS_MIGRATION');
            });
    });

    it('call init again', function () {
        return knexMigrator.init()
            .then(function () {
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(1);
                values[0].name.should.eql('Hausweib');

                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(2);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                // will throw 2 times an error
                knexMigrator.beforeEachTask.called.should.eql(true);
                knexMigrator.beforeEachTask.callCount.should.eql(2);
                knexMigrator.afterEachTask.called.should.eql(false);
            });
    });

    it('is database ok? --> no', function () {
        return knexMigrator.isDatabaseOK()
            .then(function () {
                throw new Error('Database should be NOT ok!')
            })
            .catch(function (err) {
                should.exist(err);
                (err instanceof errors.DatabaseIsNotOkError);
                err.code.should.eql('DB_NEEDS_MIGRATION');
            });
    });

    it('migrate to 1.1 and 1.2', function () {
        return knexMigrator.migrate()
            .then(function () {
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(1);
                values[0].name.should.eql('Kind');

                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(4);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                values[2].name.should.eql('1-modify-user.js');
                values[2].version.should.eql('1.1');

                values[3].name.should.eql('1-modify-user-again.js');
                values[3].version.should.eql('1.2');

                // will throw 2 times an error
                knexMigrator.beforeEachTask.called.should.eql(true);
                knexMigrator.beforeEachTask.callCount.should.eql(2);
                knexMigrator.afterEachTask.called.should.eql(true);
                knexMigrator.afterEachTask.callCount.should.eql(2);
            });
    });

    it('is database ok? --> yes', function () {
        return knexMigrator.isDatabaseOK();
    });

    it('migrate 1.2 (--v)', function () {
        return knexMigrator.migrate({version: '1.2'})
            .then(function () {
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(1);
                values[0].name.should.eql('Kind');

                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(4);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                values[2].name.should.eql('1-modify-user.js');
                values[2].version.should.eql('1.1');

                values[3].name.should.eql('1-modify-user-again.js');
                values[3].version.should.eql('1.2');

                // 1.2 was already executed
                knexMigrator.beforeEachTask.called.should.eql(false);
                knexMigrator.beforeEachTask.callCount.should.eql(0);
                knexMigrator.afterEachTask.called.should.eql(false);
                knexMigrator.afterEachTask.callCount.should.eql(0);
            });
    });

    it('migrate to 1.3', function () {
        fs.mkdirSync(migrationsv13);

        var jsFile = '' +
            'module.exports = function deleteUser(options) {' +
            'return options.transacting.raw(\'DELETE FROM users where name="Kind";\');' +
            '};';

        fs.writeFileSync(migrationsv13File, jsFile);

        return knexMigrator.migrate()
            .then(function () {
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(0);
                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(5);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                values[2].name.should.eql('1-modify-user.js');
                values[2].version.should.eql('1.1');

                values[3].name.should.eql('1-modify-user-again.js');
                values[3].version.should.eql('1.2');

                values[4].name.should.eql('1-delete-user.js');
                values[4].version.should.eql('1.3');

                // will throw 2 times an error
                knexMigrator.beforeEachTask.called.should.eql(true);
                knexMigrator.beforeEachTask.callCount.should.eql(1);
                knexMigrator.afterEachTask.called.should.eql(true);
                knexMigrator.afterEachTask.callCount.should.eql(1);
            });
    });

    it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
        fs.mkdirSync(migrationsv14);

        var jsFile1 = '' +
            'module.exports = function success(options) {' +
            'return Promise.resolve();' +
            '};';

        var jsFile2 = '' +
            'var Promise = require("bluebird");' +
            'module.exports = function scriptWillThrowError(options) {' +
            'return Promise.reject(new Error("unexpected error"));' +
            '};';

        fs.writeFileSync(migrationsv14File1, jsFile1);
        fs.writeFileSync(migrationsv14File2, jsFile2);

        return knexMigrator.migrate()
            .catch(function (err) {
                should.exist(err);
                err.message.should.eql('unexpected error');
                return connection.raw('SELECT * from users;');
            })
            .then(function (values) {
                values.length.should.eql(0);
                return connection.raw('SELECT * from migrations;')
            })
            .then(function (values) {
                values.length.should.eql(5);
                values[0].name.should.eql('1-create-tables.js');
                values[0].version.should.eql('init');

                values[1].name.should.eql('2-seed.js');
                values[1].version.should.eql('init');

                values[2].name.should.eql('1-modify-user.js');
                values[2].version.should.eql('1.1');

                values[3].name.should.eql('1-modify-user-again.js');
                values[3].version.should.eql('1.2');

                values[4].name.should.eql('1-delete-user.js');
                values[4].version.should.eql('1.3');

                knexMigrator.beforeEachTask.called.should.eql(true);
                knexMigrator.beforeEachTask.callCount.should.eql(2);
                knexMigrator.afterEachTask.called.should.eql(true);
                knexMigrator.afterEachTask.callCount.should.eql(1);
            });
    });
});