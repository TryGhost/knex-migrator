const path = require('path'),
    sinon = require('sinon'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    config = require('../config'),
    errors = require('../../lib/errors'),
    testUtils = require('../utils');

const DatabaseInfo = require('@tryghost/database-info');

const _private = {};

_private.init = function init(knexMigrator, initMethod) {
    if (initMethod === 'default') {
        return knexMigrator.init();
    } else {
        return knexMigrator.migrate({ init: true });
    }
};

for (const initMethod of ['default', 'migrateInit']) {
    describe('Functional flow: ' + initMethod, function () {
        let knexMigrator,
            basePath = path.join(__dirname, '..', 'assets', 'migrations'),
            migrationPath = basePath,
            migrationsv11 = path.join(basePath, 'versions', '1.1'),
            migrationsv12 = path.join(basePath, 'versions', '1.2'),
            migrationsv13 = path.join(basePath, 'versions', '1.3'),
            migrationsv14 = path.join(basePath, 'versions', '1.4'),
            migrationsv15 = path.join(basePath, 'versions', '1.5'),
            migrationsv11File = path.join(basePath, 'versions', '1.1', '1-modify-user.js'),
            migrationsv12File = path.join(basePath, 'versions', '1.2', '1-modify-user-again.js'),
            migrationsv13File = path.join(basePath, 'versions', '1.3', '1-delete-user.js'),
            migrationsv14File1 = path.join(basePath, 'versions', '1.4', '1-no-error.js'),
            migrationsv14File2 = path.join(basePath, 'versions', '1.4', '2-error.js'),
            migrationsv15File1 = path.join(basePath, 'versions', '1.5', '1-no-error.js'),
            migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
            connection;

        beforeAll(function () {
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

        beforeAll(function () {
            testUtils.writeMigratorConfig({
                migratorConfigPath: migratorConfigPath,
                migrationPath: migrationPath,
                currentVersion: '1.0',
            });

            knexMigrator = new KnexMigrator({
                knexMigratorFilePath: path.join(__dirname, '..', 'assets'),
            });
        });

        beforeAll(function () {
            return knexMigrator.reset({ force: true });
        });

        beforeAll(function () {
            connection = testUtils.connect();
        });

        afterAll(async function () {
            if (connection) {
                await connection.destroy();
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

                for (const key of Object.keys(require.cache)) {
                    if (key.match(/assets\/MigratorConfig\.js/)) {
                        delete require.cache[key];
                    }
                }
            }
        });

        beforeEach(function () {
            sinon.spy(knexMigrator, '_beforeEach');
            sinon.spy(knexMigrator, '_afterEach');
        });

        afterEach(function () {
            sinon.restore();
        });

        it('is database ok? --> no, because the db was never initialised', function () {
            return knexMigrator
                .isDatabaseOK()
                .then(function () {
                    throw new Error('Database should be NOT ok!');
                })
                .catch(function (err) {
                    expect(err).toEqual(expect.anything());

                    expect(err instanceof errors.DatabaseIsNotOkError).toEqual(true);

                    if (DatabaseInfo.isSQLiteConfig(config.get('database'))) {
                        expect(err.code).toEqual('MIGRATION_TABLE_IS_MISSING');
                    } else {
                        expect(err.code).toEqual('DB_NOT_INITIALISED');
                    }
                });
        });

        it('init', function () {
            return _private
                .init(knexMigrator, initMethod)
                .then(function () {
                    return connection('users');
                })
                .then(function (values) {
                    expect(values.length).toEqual(1);
                    expect(values[0].name).toEqual('Hausweib');

                    return connection('migrations');
                })
                .then(function (values) {
                    expect(values.length).toEqual(3);
                    expect(values[0].id).toEqual(expect.anything());
                    expect(values[0].name).toEqual('1-create-tables.js');
                    expect(values[0].version).toEqual('init');

                    // db was initialised when the service was on 1.0
                    expect(values[0].currentVersion).toEqual('1.0');

                    expect(values[1].name).toEqual('2-seed.js');
                    expect(values[1].version).toEqual('init');

                    expect(values[2].name).toEqual('1-another.js');
                    expect(values[2].version).toEqual('1.0');

                    expect(knexMigrator._beforeEach.called).toEqual(true);
                    expect(knexMigrator._beforeEach.callCount).toEqual(2);

                    expect(knexMigrator._afterEach.called).toEqual(true);
                });
        });

        it('is database ok? --> yes, because user has initialised the database previously', function () {
            return knexMigrator.isDatabaseOK();
        });

        it('call init again', function () {
            return _private
                .init(knexMigrator, initMethod)
                .then(function () {
                    return connection('users');
                })
                .then(function (values) {
                    expect(values.length).toEqual(1);
                    expect(values[0].name).toEqual('Hausweib');

                    return connection('migrations');
                })
                .then(function (values) {
                    expect(values.length).toEqual(3);

                    // will throw 2 times an error
                    expect(knexMigrator._beforeEach.called).toEqual(true);
                    expect(knexMigrator._beforeEach.callCount).toEqual(2);
                    expect(knexMigrator._afterEach.called).toEqual(false);
                });
        });

        it('is database ok? --> still yes', function () {
            return knexMigrator.isDatabaseOK();
        });

        it('add 1.1 and 1.2', function () {
            fs.mkdirSync(migrationsv11);
            fs.mkdirSync(migrationsv12);

            let jsFile = testUtils.generateMigrationScript({
                up: "UPDATE users set name='Hausmann';",
                down: "UPDATE users set name='LULULU';",
            });

            let jsFile1 = testUtils.generateMigrationScript({
                up: "UPDATE users set name='Kind';",
                down: "UPDATE users set name='Hausmann';",
            });

            fs.writeFileSync(migrationsv11File, jsFile);
            fs.writeFileSync(migrationsv12File, jsFile1);
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.2';
        });

        it('is database ok? --> no, 1.1 and 1.2 migrations are missing', function () {
            return knexMigrator
                .isDatabaseOK()
                .then(function () {
                    throw new Error('database should be not ok');
                })
                .catch(function (err) {
                    expect(err).toEqual(expect.anything());
                    expect(err instanceof errors.DatabaseIsNotOkError).toEqual(true);
                });
        });

        it('migrate to 1.1 and 1.2', function () {
            // covers case that init completion is not executed (!)
            return knexMigrator
                .migrate({ init: true })
                .then(function () {
                    return connection('users');
                })
                .then(function (values) {
                    expect(values.length).toEqual(1);
                    expect(values[0].name).toEqual('Kind');

                    return connection('migrations');
                })
                .then(function (values) {
                    expect(values.length).toEqual(5);
                    expect(values[0].name).toEqual('1-create-tables.js');
                    expect(values[0].version).toEqual('init');

                    expect(values[1].name).toEqual('2-seed.js');
                    expect(values[1].version).toEqual('init');

                    expect(values[2].name).toEqual('1-another.js');
                    expect(values[2].version).toEqual('1.0');

                    expect(values[3].name).toEqual('1-modify-user.js');
                    expect(values[3].version).toEqual('1.1');

                    expect(values[4].name).toEqual('1-modify-user-again.js');
                    expect(values[4].version).toEqual('1.2');

                    // will throw 2 times an error
                    expect(knexMigrator._beforeEach.called).toEqual(true);
                    expect(knexMigrator._beforeEach.callCount).toEqual(4);
                    expect(knexMigrator._afterEach.called).toEqual(true);
                    expect(knexMigrator._afterEach.callCount).toEqual(2);
                });
        });

        it('is database ok? --> yes sure', function () {
            return knexMigrator.isDatabaseOK();
        });

        it('migrate 1.2 (--v)', function () {
            return knexMigrator
                .migrate({ version: '1.2' })
                .then(function () {
                    return connection('users');
                })
                .then(function (values) {
                    expect(values.length).toEqual(1);
                    expect(values[0].name).toEqual('Kind');

                    return connection('migrations');
                })
                .then(function (values) {
                    expect(values.length).toEqual(5);
                    expect(values[0].name).toEqual('1-create-tables.js');
                    expect(values[0].version).toEqual('init');

                    expect(values[1].name).toEqual('2-seed.js');
                    expect(values[1].version).toEqual('init');

                    expect(values[2].name).toEqual('1-another.js');
                    expect(values[2].version).toEqual('1.0');

                    expect(values[3].name).toEqual('1-modify-user.js');
                    expect(values[3].version).toEqual('1.1');

                    expect(values[4].name).toEqual('1-modify-user-again.js');
                    expect(values[4].version).toEqual('1.2');

                    // 1.2 was already executed
                    expect(knexMigrator._beforeEach.called).toEqual(false);
                    expect(knexMigrator._beforeEach.callCount).toEqual(0);
                    expect(knexMigrator._afterEach.called).toEqual(false);
                    expect(knexMigrator._afterEach.callCount).toEqual(0);
                });
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.3';
        });

        it('migrate to 1.3', function () {
            fs.mkdirSync(migrationsv13);

            let jsFile = testUtils.generateMigrationScript({
                up: "DELETE FROM users where name='Kind';",
                down: 'INSERT INTO users (name) VALUES ("Kind");',
            });

            fs.writeFileSync(migrationsv13File, jsFile);

            return knexMigrator
                .migrate()
                .then(function () {
                    return connection('users');
                })
                .then(function (values) {
                    expect(values.length).toEqual(0);
                    return connection('migrations');
                })
                .then(function (values) {
                    expect(values.length).toEqual(6);
                    expect(values[0].name).toEqual('1-create-tables.js');
                    expect(values[0].version).toEqual('init');

                    expect(values[1].name).toEqual('2-seed.js');
                    expect(values[1].version).toEqual('init');

                    expect(values[2].name).toEqual('1-another.js');
                    expect(values[2].version).toEqual('1.0');

                    expect(values[3].name).toEqual('1-modify-user.js');
                    expect(values[3].version).toEqual('1.1');

                    expect(values[4].name).toEqual('1-modify-user-again.js');
                    expect(values[4].version).toEqual('1.2');

                    expect(values[5].name).toEqual('1-delete-user.js');
                    expect(values[5].version).toEqual('1.3');

                    // will throw 2 times an error
                    expect(knexMigrator._beforeEach.called).toEqual(true);
                    expect(knexMigrator._beforeEach.callCount).toEqual(1);
                    expect(knexMigrator._afterEach.called).toEqual(true);
                    expect(knexMigrator._afterEach.callCount).toEqual(1);
                });
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.4';
        });

        describe('migrate to 1.4', function () {
            beforeEach(function () {
                for (const key of Object.keys(require.cache)) {
                    if (key.match(/migrations\/versions\/1.4\/2-error.js/)) {
                        delete require.cache[key];
                    }
                }
            });

            it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
                fs.mkdirSync(migrationsv14);

                let jsFile1 = testUtils.generateMigrationScript({
                    up: 'SELECT * FROM users;',
                });

                let jsFile2 =
                    '' +
                    'module.exports.up = function scriptWillThrowError(options) {' +
                    'return Promise.reject(new Error("unexpected error"));' +
                    '};';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator
                    .migrate()
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        expect(err).toEqual(expect.anything());
                        expect(err.message).toEqual('unexpected error');

                        return connection('users')
                            .then(function (values) {
                                expect(values.length).toEqual(0);
                                return connection('migrations');
                            })
                            .then(function (values) {
                                expect(values.length).toEqual(6);
                                expect(values[0].name).toEqual('1-create-tables.js');
                                expect(values[0].version).toEqual('init');

                                expect(values[1].name).toEqual('2-seed.js');
                                expect(values[1].version).toEqual('init');

                                expect(values[2].name).toEqual('1-another.js');
                                expect(values[2].version).toEqual('1.0');

                                expect(values[3].name).toEqual('1-modify-user.js');
                                expect(values[3].version).toEqual('1.1');

                                expect(values[4].name).toEqual('1-modify-user-again.js');
                                expect(values[4].version).toEqual('1.2');

                                expect(values[5].name).toEqual('1-delete-user.js');
                                expect(values[5].version).toEqual('1.3');

                                // 2-error is missing!

                                expect(knexMigrator._beforeEach.called).toEqual(true);
                                expect(knexMigrator._beforeEach.callCount).toEqual(2);
                                expect(knexMigrator._afterEach.called).toEqual(true);
                                expect(knexMigrator._afterEach.callCount).toEqual(1);
                            });
                    });
            });

            it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                let jsFile1 = testUtils.generateMigrationScript({
                    up: 'SELECT * FROM users;',
                });

                let jsFile2 = '' + 'var Promise = require("lalalalala");';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return connection('migrations')
                    .then(function (values) {
                        expect(values.length).toEqual(6);

                        return knexMigrator.migrate();
                    })
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        expect(err).toEqual(expect.anything());
                        expect(err.message).toMatch(/^Cannot find module 'lalalalala'/);

                        return connection('users')
                            .then(function (values) {
                                expect(values.length).toEqual(0);
                                return connection('migrations');
                            })
                            .then(function (values) {
                                expect(values.length).toEqual(6);
                                expect(values[0].name).toEqual('1-create-tables.js');
                                expect(values[0].version).toEqual('init');

                                expect(values[1].name).toEqual('2-seed.js');
                                expect(values[1].version).toEqual('init');

                                expect(values[2].name).toEqual('1-another.js');
                                expect(values[2].version).toEqual('1.0');

                                expect(values[3].name).toEqual('1-modify-user.js');
                                expect(values[3].version).toEqual('1.1');

                                expect(values[4].name).toEqual('1-modify-user-again.js');
                                expect(values[4].version).toEqual('1.2');

                                expect(values[5].name).toEqual('1-delete-user.js');
                                expect(values[5].version).toEqual('1.3');

                                expect(knexMigrator._beforeEach.called).toEqual(false);
                                expect(knexMigrator._beforeEach.callCount).toEqual(0);
                                expect(knexMigrator._afterEach.called).toEqual(false);
                                expect(knexMigrator._afterEach.callCount).toEqual(0);
                            });
                    });
            });

            it('migrate to 1.4, but error happens in one of the scripts --> expect rollback', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                let jsFile1 =
                    '' +
                    'module.exports.up = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                let jsFile2 = '' + 'var x = y;';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator
                    .migrate()
                    .then(function () {
                        throw new Error('This test case should fail! Please check why!');
                    })
                    .catch(function (err) {
                        expect(err).toEqual(expect.anything());
                        expect(err.message).toEqual('y is not defined');

                        return connection('users')
                            .then(function (values) {
                                expect(values.length).toEqual(0);
                                return connection('migrations');
                            })
                            .then(function (values) {
                                expect(values.length).toEqual(6);
                                expect(values[0].name).toEqual('1-create-tables.js');
                                expect(values[0].version).toEqual('init');

                                expect(values[1].name).toEqual('2-seed.js');
                                expect(values[1].version).toEqual('init');

                                expect(values[2].name).toEqual('1-another.js');
                                expect(values[2].version).toEqual('1.0');

                                expect(values[3].name).toEqual('1-modify-user.js');
                                expect(values[3].version).toEqual('1.1');

                                expect(values[4].name).toEqual('1-modify-user-again.js');
                                expect(values[4].version).toEqual('1.2');

                                expect(values[5].name).toEqual('1-delete-user.js');
                                expect(values[5].version).toEqual('1.3');

                                expect(knexMigrator._beforeEach.called).toEqual(false);
                                expect(knexMigrator._afterEach.called).toEqual(false);
                            });
                    });
            });

            it('migrate to 1.4, fixed error', function () {
                fs.unlinkSync(migrationsv14File1);
                fs.unlinkSync(migrationsv14File2);

                fs.rmdirSync(migrationsv14);
                fs.mkdirSync(migrationsv14);

                let jsFile1 =
                    '' +
                    'module.exports.up = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                let jsFile2 =
                    '' +
                    'module.exports.up = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                fs.writeFileSync(migrationsv14File1, jsFile1);
                fs.writeFileSync(migrationsv14File2, jsFile2);

                return knexMigrator
                    .migrate()
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(0);
                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(8);
                        expect(values[0].name).toEqual('1-create-tables.js');
                        expect(values[0].version).toEqual('init');

                        expect(values[1].name).toEqual('2-seed.js');
                        expect(values[1].version).toEqual('init');

                        expect(values[2].name).toEqual('1-another.js');
                        expect(values[2].version).toEqual('1.0');

                        expect(values[3].name).toEqual('1-modify-user.js');
                        expect(values[3].version).toEqual('1.1');

                        expect(values[4].name).toEqual('1-modify-user-again.js');
                        expect(values[4].version).toEqual('1.2');

                        expect(values[5].name).toEqual('1-delete-user.js');
                        expect(values[5].version).toEqual('1.3');

                        expect(values[6].name).toEqual('1-no-error.js');
                        expect(values[6].version).toEqual('1.4');

                        expect(values[7].name).toEqual('2-error.js');
                        expect(values[7].version).toEqual('1.4');

                        expect(knexMigrator._beforeEach.called).toEqual(true);
                        expect(knexMigrator._beforeEach.callCount).toEqual(2);
                        expect(knexMigrator._afterEach.called).toEqual(true);
                        expect(knexMigrator._afterEach.callCount).toEqual(2);
                    });
            });
        });

        describe('remove a migration script', function () {
            it('remove one entry from the database', function () {
                let removedEntry;

                return connection('migrations')
                    .then(function (values) {
                        expect(values.length).toEqual(8);

                        removedEntry = values[7];

                        return connection('migrations').where('id', values[7].id).delete();
                    })
                    .then(function () {
                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(7);
                    })
                    .then(function () {
                        return knexMigrator.isDatabaseOK();
                    })
                    .then(function () {
                        throw new Error('should fail');
                    })
                    .catch(function (err) {
                        expect(err instanceof errors.DatabaseIsNotOkError).toEqual(true);
                    })
                    .then(function () {
                        return knexMigrator.migrate();
                    })
                    .then(function () {
                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(8);
                        expect(values[7].name).toEqual(removedEntry.name);
                        expect(values[7].version).toEqual(removedEntry.version);
                        expect(values[7].currentVersion).toEqual(removedEntry.currentVersion);
                    });
            });
        });

        describe('migrate to 1.5', function () {
            it('migrate to 1.5, but current version is 1.4 (no force)', function () {
                fs.mkdirSync(migrationsv15);

                let jsFile1 =
                    '' +
                    'module.exports.up = function success(options) {' +
                    'return Promise.resolve();' +
                    '};';

                fs.writeFileSync(migrationsv15File1, jsFile1);

                return knexMigrator
                    .migrate()
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(0);
                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(8);
                        expect(values[0].name).toEqual('1-create-tables.js');
                        expect(values[0].version).toEqual('init');

                        expect(values[1].name).toEqual('2-seed.js');
                        expect(values[1].version).toEqual('init');

                        expect(values[2].name).toEqual('1-another.js');
                        expect(values[2].version).toEqual('1.0');

                        expect(values[3].name).toEqual('1-modify-user.js');
                        expect(values[3].version).toEqual('1.1');

                        expect(values[4].name).toEqual('1-modify-user-again.js');
                        expect(values[4].version).toEqual('1.2');

                        expect(values[5].name).toEqual('1-delete-user.js');
                        expect(values[5].version).toEqual('1.3');

                        expect(values[6].name).toEqual('1-no-error.js');
                        expect(values[6].version).toEqual('1.4');

                        expect(values[7].name).toEqual('2-error.js');
                        expect(values[7].version).toEqual('1.4');
                    });
            });

            it('migrate 1.5 (--v) and force', function () {
                // current is 1.4
                return knexMigrator
                    .migrate({ version: '1.5', force: true })
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(0);
                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(9);
                        expect(values[0].name).toEqual('1-create-tables.js');
                        expect(values[0].version).toEqual('init');

                        expect(values[1].name).toEqual('2-seed.js');
                        expect(values[1].version).toEqual('init');

                        expect(values[2].name).toEqual('1-another.js');
                        expect(values[2].version).toEqual('1.0');

                        expect(values[3].name).toEqual('1-modify-user.js');
                        expect(values[3].version).toEqual('1.1');

                        expect(values[4].name).toEqual('1-modify-user-again.js');
                        expect(values[4].version).toEqual('1.2');

                        expect(values[5].name).toEqual('1-delete-user.js');
                        expect(values[5].version).toEqual('1.3');

                        expect(values[6].name).toEqual('1-no-error.js');
                        expect(values[6].version).toEqual('1.4');

                        expect(values[7].name).toEqual('2-error.js');
                        expect(values[7].version).toEqual('1.4');

                        expect(values[8].name).toEqual('1-no-error.js');
                        expect(values[8].version).toEqual('1.5');
                    });
            });
        });

        it('change current version', function () {
            knexMigrator.currentVersion = '1.4';
            if (DatabaseInfo.isSQLiteConfig(config.get('database'))) {
                return connection.raw(`PRAGMA index_list('migrations_lock');`).then((indexes) => {
                    expect(indexes.filter((index) => index.origin === 'pk').length).toEqual(1);
                });
            } else {
                return connection
                    .raw(
                        `
                SELECT CONSTRAINT_NAME
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_NAME=:tableName
                AND CONSTRAINT_TYPE='PRIMARY KEY'`,
                        { tableName: 'migrations_lock' },
                    )
                    .then(([rawConstraints]) => {
                        expect(rawConstraints.length).toEqual(1);
                    });
            }
        });
    });
}
