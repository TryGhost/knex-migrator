var KnexMigrator = require('../lib'),
    errors = require('../lib/errors'),
    _ = require('lodash'),
    path = require('path'),
    knex = require('knex'),
    sinon = require('sinon'),
    sandbox = sinon.sandbox.create(),
    should = require('should'),
    fs = require('fs'),
    _private = {};

_private.init = function init(knexMigrator, initMethod) {
    if (initMethod === 'default') {
        return knexMigrator.init();
    } else {
        return knexMigrator.migrate({init: true});
    }
};

_.each(['default', 'migrateInit'], function (initMethod) {
    describe('Functional flow', function () {
        var knexMigrator,
            dbFile = __dirname + '/assets/test.db',
            migrationsv11 = __dirname + '/assets/migrations/versions/1.1',
            migrationsv12 = __dirname + '/assets/migrations/versions/1.2',
            migrationsv13 = __dirname + '/assets/migrations/versions/1.3',
            migrationsv14 = __dirname + '/assets/migrations/versions/1.4',
            migrationsv15 = __dirname + '/assets/migrations/versions/1.5',
            migrationsv11File = __dirname + '/assets/migrations/versions/1.1/1-modify-user.js',
            migrationsv12File = __dirname + '/assets/migrations/versions/1.2/1-modify-user-again.js',
            migrationsv13File = __dirname + '/assets/migrations/versions/1.3/1-delete-user.js',
            migrationsv14File1 = __dirname + '/assets/migrations/versions/1.4/1-no-error.js',
            migrationsv14File2 = __dirname + '/assets/migrations/versions/1.4/2-error.js',
            migrationsv15File1 = __dirname + '/assets/migrations/versions/1.5/1-no-error.js',
            migratorConfigPath = __dirname + '/assets/MigratorConfig.js',
            connection;

        before(function () {
            if (fs.existsSync(dbFile)) {
                fs.unlinkSync(dbFile);
            }

            if (fs.existsSync(migrationsv11File)) {
                fs.unlinkSync(migrationsv11File);
            }

            if (fs.existsSync(migrationsv12File)) {
                fs.unlinkSync(migrationsv12File);
            }

            if (fs.existsSync(migrationsv13File)) {
                fs.unlinkSync(migrationsv13File);
            }

            if (fs.existsSync(migrationsv11)) {
                fs.rmdirSync(migrationsv11);
            }

            if (fs.existsSync(migrationsv12)) {
                fs.rmdirSync(migrationsv12);
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

            if (fs.existsSync(migrationsv15File1)) {
                fs.unlinkSync(migrationsv15File1);
            }

            if (fs.existsSync(migrationsv14)) {
                fs.rmdirSync(migrationsv14);
            }

            if (fs.existsSync(migrationsv15)) {
                fs.rmdirSync(migrationsv15);
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

            var migratorConfig = '' +
                'var path = require("path");' +
                'module.exports = {' +
                '  database: {' +
                '    client: "sqlite3",' +
                '    connection: {' +
                '      filename: path.join(process.cwd(), "test/assets/test.db")' +
                '    }' +
                '  },' +
                '  migrationPath: path.join(process.cwd(), "test/assets/migrations"),' +
                '  currentVersion: "1.0"' +
                '};';

            fs.writeFileSync(migratorConfigPath, migratorConfig, 'utf-8');

            knexMigrator = new KnexMigrator({
                knexMigratorFilePath: __dirname + '/assets'
            });
        });

        after(function (done) {
            connection && connection.destroy(done);

            if (fs.existsSync(dbFile)) {
                fs.unlinkSync(dbFile);
            }

            if (fs.existsSync(migrationsv11File)) {
                fs.unlinkSync(migrationsv11File);
            }

            if (fs.existsSync(migrationsv12File)) {
                fs.unlinkSync(migrationsv12File);
            }

            if (fs.existsSync(migrationsv13File)) {
                fs.unlinkSync(migrationsv13File);
            }

            if (fs.existsSync(migrationsv11)) {
                fs.rmdirSync(migrationsv11);
            }

            if (fs.existsSync(migrationsv12)) {
                fs.rmdirSync(migrationsv12);
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

            if (fs.existsSync(migrationsv15File1)) {
                fs.unlinkSync(migrationsv15File1);
            }

            if (fs.existsSync(migrationsv14)) {
                fs.rmdirSync(migrationsv14);
            }

            if (fs.existsSync(migrationsv15)) {
                fs.rmdirSync(migrationsv15);
            }

            if (fs.existsSync(migratorConfigPath)) {
                fs.unlinkSync(migratorConfigPath);

                _.each(require.cache, function (value, key) {
                    if (key.match(/assets\/MigratorConfig\.js/)) {
                        delete require.cache[key];
                    }
                });
            }
        });

        beforeEach(function () {
            sandbox.spy(knexMigrator, 'beforeEachTask');
            sandbox.spy(knexMigrator, 'afterEachTask');
        });

        afterEach(function () {
            sandbox.restore();
        });

        it('is database ok? --> no, because the db was never initialised', function () {
            return knexMigrator.isDatabaseOK()
                .then(function () {
                    throw new Error('Database should be NOT ok!')
                })
                .catch(function (err) {
                    should.exist(err);
                    (err instanceof errors.DatabaseIsNotOkError).should.eql(true);
                    err.code.should.eql('MIGRATION_TABLE_IS_MISSING');
                });
        });

        it('init', function () {
            return _private.init(knexMigrator, initMethod)
                .then(function () {
                    return connection.raw('SELECT * from users;');
                })
                .then(function (values) {
                    values.length.should.eql(1);
                    values[0].name.should.eql('Hausweib');

                    return connection.raw('SELECT * from migrations;')
                })
                .then(function (values) {
                    values.length.should.eql(3);
                    should.exist(values[0].id);
                    values[0].name.should.eql('1-create-tables.js');
                    values[0].version.should.eql('init');

                    // db was initialised when the service was on 1.0
                    values[0].currentVersion.should.eql('1.0');

                    values[1].name.should.eql('2-seed.js');
                    values[1].version.should.eql('init');

                    values[2].name.should.eql('1-another.js');
                    values[2].version.should.eql('1.0');

                    knexMigrator.beforeEachTask.called.should.eql(true);
                    knexMigrator.beforeEachTask.callCount.should.eql(2);

                    knexMigrator.afterEachTask.called.should.eql(true);
                    knexMigrator.afterEachTask.callCount.should.eql(2);
                })
        });

        it('is database ok? --> yes, because user has initialised the database previously', function () {
            return knexMigrator.isDatabaseOK();
        });

        it('call init again', function () {
            return _private.init(knexMigrator, initMethod)
                .then(function () {
                    return connection.raw('SELECT * from users;');
                })
                .then(function (values) {
                    values.length.should.eql(1);
                    values[0].name.should.eql('Hausweib');

                    return connection.raw('SELECT * from migrations;')
                })
                .then(function (values) {
                    values.length.should.eql(3);

                    // will throw 2 times an error
                    knexMigrator.beforeEachTask.called.should.eql(true);
                    knexMigrator.beforeEachTask.callCount.should.eql(2);
                    knexMigrator.afterEachTask.called.should.eql(false);
                });
        });

        it('is database ok? --> still yes', function () {
            return knexMigrator.isDatabaseOK();
        });

        it('add 1.1 and 1.2', function () {
            fs.mkdirSync(migrationsv11);
            fs.mkdirSync(migrationsv12);

            var jsFile = '' +
                'module.exports = function something(options) {' +
                'return options.transacting.raw(\'UPDATE users set name="Hausmann";\');' +
                '};';

            var jsFile1 = '' +
                'module.exports = function something(options) {' +
                'return options.transacting.raw(\'UPDATE users set name="Kind";\');' +
                '};';

            fs.writeFileSync(migrationsv11File, jsFile);
            fs.writeFileSync(migrationsv12File, jsFile1);
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.2';
        });

        it('is database ok? --> no, 1.1 and 1.2 migrations are missing', function () {
            return knexMigrator.isDatabaseOK()
                .then(function () {
                    throw new Error('database should be not ok');
                })
                .catch(function (err) {
                    should.exist(err);
                    (err instanceof errors.DatabaseIsNotOkError).should.eql(true);
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
                    values.length.should.eql(5);
                    values[0].name.should.eql('1-create-tables.js');
                    values[0].version.should.eql('init');

                    values[1].name.should.eql('2-seed.js');
                    values[1].version.should.eql('init');

                    values[2].name.should.eql('1-another.js');
                    values[2].version.should.eql('1.0');

                    values[3].name.should.eql('1-modify-user.js');
                    values[3].version.should.eql('1.1');

                    values[4].name.should.eql('1-modify-user-again.js');
                    values[4].version.should.eql('1.2');

                    // will throw 2 times an error
                    knexMigrator.beforeEachTask.called.should.eql(true);
                    knexMigrator.beforeEachTask.callCount.should.eql(2);
                    knexMigrator.afterEachTask.called.should.eql(true);
                    knexMigrator.afterEachTask.callCount.should.eql(2);
                });
        });

        it('is database ok? --> yes sure', function () {
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
                    values.length.should.eql(5);
                    values[0].name.should.eql('1-create-tables.js');
                    values[0].version.should.eql('init');

                    values[1].name.should.eql('2-seed.js');
                    values[1].version.should.eql('init');

                    values[2].name.should.eql('1-another.js');
                    values[2].version.should.eql('1.0');

                    values[3].name.should.eql('1-modify-user.js');
                    values[3].version.should.eql('1.1');

                    values[4].name.should.eql('1-modify-user-again.js');
                    values[4].version.should.eql('1.2');

                    // 1.2 was already executed
                    knexMigrator.beforeEachTask.called.should.eql(false);
                    knexMigrator.beforeEachTask.callCount.should.eql(0);
                    knexMigrator.afterEachTask.called.should.eql(false);
                    knexMigrator.afterEachTask.callCount.should.eql(0);
                });
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.3';
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
                    values.length.should.eql(6);
                    values[0].name.should.eql('1-create-tables.js');
                    values[0].version.should.eql('init');

                    values[1].name.should.eql('2-seed.js');
                    values[1].version.should.eql('init');

                    values[2].name.should.eql('1-another.js');
                    values[2].version.should.eql('1.0');

                    values[3].name.should.eql('1-modify-user.js');
                    values[3].version.should.eql('1.1');

                    values[4].name.should.eql('1-modify-user-again.js');
                    values[4].version.should.eql('1.2');

                    values[5].name.should.eql('1-delete-user.js');
                    values[5].version.should.eql('1.3');

                    // will throw 2 times an error
                    knexMigrator.beforeEachTask.called.should.eql(true);
                    knexMigrator.beforeEachTask.callCount.should.eql(1);
                    knexMigrator.afterEachTask.called.should.eql(true);
                    knexMigrator.afterEachTask.callCount.should.eql(1);
                });
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.4';
        });

        describe('migrate to 1.4', function () {
            beforeEach(function () {
                _.each(require.cache, function (value, key) {
                    if (key.match(/migrations\/versions\/1.4\/2-error.js/)) {
                        delete require.cache[key];
                    }
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
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        should.exist(err);
                        err.message.should.eql('unexpected error');

                        return connection.raw('SELECT * from users;')
                            .then(function (values) {
                                values.length.should.eql(0);
                                return connection.raw('SELECT * from migrations;')
                            })
                            .then(function (values) {
                                values.length.should.eql(6);
                                values[0].name.should.eql('1-create-tables.js');
                                values[0].version.should.eql('init');

                                values[1].name.should.eql('2-seed.js');
                                values[1].version.should.eql('init');

                                values[2].name.should.eql('1-another.js');
                                values[2].version.should.eql('1.0');

                                values[3].name.should.eql('1-modify-user.js');
                                values[3].version.should.eql('1.1');

                                values[4].name.should.eql('1-modify-user-again.js');
                                values[4].version.should.eql('1.2');

                                values[5].name.should.eql('1-delete-user.js');
                                values[5].version.should.eql('1.3');

                                knexMigrator.beforeEachTask.called.should.eql(true);
                                knexMigrator.beforeEachTask.callCount.should.eql(2);
                                knexMigrator.afterEachTask.called.should.eql(true);
                                knexMigrator.afterEachTask.callCount.should.eql(1);
                            });
                    });
            });

            it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                var jsFile1 = '' +
                    'module.exports = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                var jsFile2 = '' +
                    'var Promise = require("lalalalala");';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator.migrate()
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        should.exist(err);
                        err.message.should.eql('Cannot find module \'lalalalala\'');

                        return connection.raw('SELECT * from users;')
                            .then(function (values) {
                                values.length.should.eql(0);
                                return connection.raw('SELECT * from migrations;')
                            })
                            .then(function (values) {
                                values.length.should.eql(6);
                                values[0].name.should.eql('1-create-tables.js');
                                values[0].version.should.eql('init');

                                values[1].name.should.eql('2-seed.js');
                                values[1].version.should.eql('init');

                                values[2].name.should.eql('1-another.js');
                                values[2].version.should.eql('1.0');

                                values[3].name.should.eql('1-modify-user.js');
                                values[3].version.should.eql('1.1');

                                values[4].name.should.eql('1-modify-user-again.js');
                                values[4].version.should.eql('1.2');

                                values[5].name.should.eql('1-delete-user.js');
                                values[5].version.should.eql('1.3');

                                knexMigrator.beforeEachTask.called.should.eql(false);
                                knexMigrator.afterEachTask.called.should.eql(false);
                            });
                    });
            });

            it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                var jsFile1 = '' +
                    'module.exports = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                var jsFile2 = '' +
                    'var x = y;';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator.migrate()
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        should.exist(err);
                        err.message.should.eql('y is not defined');

                        return connection.raw('SELECT * from users;')
                            .then(function (values) {
                                values.length.should.eql(0);
                                return connection.raw('SELECT * from migrations;')
                            })
                            .then(function (values) {
                                values.length.should.eql(6);
                                values[0].name.should.eql('1-create-tables.js');
                                values[0].version.should.eql('init');

                                values[1].name.should.eql('2-seed.js');
                                values[1].version.should.eql('init');

                                values[2].name.should.eql('1-another.js');
                                values[2].version.should.eql('1.0');

                                values[3].name.should.eql('1-modify-user.js');
                                values[3].version.should.eql('1.1');

                                values[4].name.should.eql('1-modify-user-again.js');
                                values[4].version.should.eql('1.2');

                                values[5].name.should.eql('1-delete-user.js');
                                values[5].version.should.eql('1.3');

                                knexMigrator.beforeEachTask.called.should.eql(false);
                                knexMigrator.afterEachTask.called.should.eql(false);
                            });
                    });
            });

            it('migrate to 1.4, fixed error', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                var jsFile1 = '' +
                    'module.exports = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                var jsFile2 = '' +
                    'module.exports = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator.migrate()
                    .then(function () {
                        return connection.raw('SELECT * from users;');
                    })
                    .then(function (values) {
                        values.length.should.eql(0);
                        return connection.raw('SELECT * from migrations;')
                    })
                    .then(function (values) {
                        values.length.should.eql(8);
                        values[0].name.should.eql('1-create-tables.js');
                        values[0].version.should.eql('init');

                        values[1].name.should.eql('2-seed.js');
                        values[1].version.should.eql('init');

                        values[2].name.should.eql('1-another.js');
                        values[2].version.should.eql('1.0');

                        values[3].name.should.eql('1-modify-user.js');
                        values[3].version.should.eql('1.1');

                        values[4].name.should.eql('1-modify-user-again.js');
                        values[4].version.should.eql('1.2');

                        values[5].name.should.eql('1-delete-user.js');
                        values[5].version.should.eql('1.3');

                        values[6].name.should.eql('1-no-error.js');
                        values[6].version.should.eql('1.4');

                        values[7].name.should.eql('2-error.js');
                        values[7].version.should.eql('1.4');

                        knexMigrator.beforeEachTask.called.should.eql(true);
                        knexMigrator.beforeEachTask.callCount.should.eql(2);
                        knexMigrator.afterEachTask.called.should.eql(true);
                        knexMigrator.afterEachTask.callCount.should.eql(2);
                    });
            });
        });

        describe('migrate to 1.5', function () {
            it('migrate to 1.5, but current version is 1.4 (no force)', function () {
                fs.mkdirSync(migrationsv15);

                var jsFile1 = '' +
                    'module.exports = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                fs.writeFileSync(migrationsv15File1, jsFile1);

                return knexMigrator.migrate()
                    .then(function () {
                        return connection.raw('SELECT * from users;');
                    })
                    .then(function (values) {
                        values.length.should.eql(0);
                        return connection.raw('SELECT * from migrations;')
                    })
                    .then(function (values) {
                        values.length.should.eql(8);
                        values[0].name.should.eql('1-create-tables.js');
                        values[0].version.should.eql('init');

                        values[1].name.should.eql('2-seed.js');
                        values[1].version.should.eql('init');

                        values[2].name.should.eql('1-another.js');
                        values[2].version.should.eql('1.0');

                        values[3].name.should.eql('1-modify-user.js');
                        values[3].version.should.eql('1.1');

                        values[4].name.should.eql('1-modify-user-again.js');
                        values[4].version.should.eql('1.2');

                        values[5].name.should.eql('1-delete-user.js');
                        values[5].version.should.eql('1.3');

                        values[6].name.should.eql('1-no-error.js');
                        values[6].version.should.eql('1.4');

                        values[7].name.should.eql('2-error.js');
                        values[7].version.should.eql('1.4');
                    });
            });

            it('migrate 1.5 (--v) and force', function () {
                // current is 1.4
                return knexMigrator.migrate({version: '1.5', force: true})
                    .then(function () {
                        return connection.raw('SELECT * from users;');
                    })
                    .then(function (values) {
                        values.length.should.eql(0);
                        return connection.raw('SELECT * from migrations;')
                    })
                    .then(function (values) {
                        values.length.should.eql(9);
                        values[0].name.should.eql('1-create-tables.js');
                        values[0].version.should.eql('init');

                        values[1].name.should.eql('2-seed.js');
                        values[1].version.should.eql('init');

                        values[2].name.should.eql('1-another.js');
                        values[2].version.should.eql('1.0');

                        values[3].name.should.eql('1-modify-user.js');
                        values[3].version.should.eql('1.1');

                        values[4].name.should.eql('1-modify-user-again.js');
                        values[4].version.should.eql('1.2');

                        values[5].name.should.eql('1-delete-user.js');
                        values[5].version.should.eql('1.3');

                        values[6].name.should.eql('1-no-error.js');
                        values[6].version.should.eql('1.4');

                        values[7].name.should.eql('2-error.js');
                        values[7].version.should.eql('1.4');

                        values[8].name.should.eql('1-no-error.js');
                        values[8].version.should.eql('1.5');
                    });
            });
        });
    });
});