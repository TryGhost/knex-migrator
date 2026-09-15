const path = require('path'),
    fs = require('fs'),
    config = require('../config'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

const _private = {};

_private.isBetterSQLite3 = function isBetterSQLite3() {
    // `sqlite3` configs are aliased to the `better-sqlite3` driver at connect time,
    // so both report the same runtime behaviour.
    const client = config.get('database:client');
    return client === 'better-sqlite3' || client === 'sqlite3';
};

_private.assertTableMissingError = function assertTableMissingError(err) {
    if (['mysql', 'mysql2'].includes(config.get('database:client'))) {
        expect(err.errno).toEqual(1146);
    } else {
        expect(err.code).toEqual('SQLITE_ERROR');
        expect(err.message).toMatch(/^select \* from/);
        expect(err.message).toContain('no such table:');
    }
};

let migratorConfigPath, migrationPath;

let knexMigrator, connection;

describe('Implicit Commits', function () {
    describe('knex-migrator init', function () {
        describe('fail #1', function () {
            beforeAll(function () {
                migratorConfigPath = path.join(
                    __dirname,
                    '..',
                    'assets',
                    'migrations_1',
                    'MigratorConfig.js',
                );
                migrationPath = path.join(__dirname, '..', 'assets', 'migrations_1');

                testUtils.writeMigratorConfig({
                    migratorConfigPath: migratorConfigPath,
                    migrationPath: migrationPath,
                    currentVersion: '1.0',
                });

                knexMigrator = new KnexMigrator({
                    knexMigratorFilePath: migrationPath,
                });

                connection = testUtils.connect();

                return knexMigrator.reset();
            });

            afterAll(function () {
                if (fs.existsSync(migratorConfigPath)) {
                    fs.unlinkSync(migratorConfigPath);
                }
            });

            it('expect full DML rollback', function () {
                return knexMigrator
                    .init()
                    .then(function () {
                        throw new Error('init should fail');
                    })
                    .catch(function (err) {
                        expect(err.message).toEqual('unknown');
                        return connection('users');
                    })
                    .then(function (values) {
                        // mysql table still exists, was not manually rolled back, see assets
                        expect(values.length).toEqual(0);
                    })
                    .catch(function (err) {
                        // sqlite doesn't use autocommits inside an explicit transaction
                        expect(err.errno).toEqual(1);
                    });
            });
        });

        describe('fail #2', function () {
            beforeAll(function () {
                migratorConfigPath = path.join(
                    __dirname,
                    '..',
                    'assets',
                    'migrations_2',
                    'MigratorConfig.js',
                );
                migrationPath = path.join(__dirname, '..', 'assets', 'migrations_2');

                testUtils.writeMigratorConfig({
                    migratorConfigPath: migratorConfigPath,
                    migrationPath: migrationPath,
                    currentVersion: '1.0',
                });

                knexMigrator = new KnexMigrator({
                    knexMigratorFilePath: migrationPath,
                });

                connection = testUtils.connect();

                return knexMigrator.reset();
            });

            afterAll(function () {
                if (fs.existsSync(migratorConfigPath)) {
                    fs.unlinkSync(migratorConfigPath);
                }
            });

            it('expect full DDL/DML rollback', function () {
                return knexMigrator
                    .init()
                    .then(function () {
                        throw new Error('init should fail');
                    })
                    .catch(function (err) {
                        expect(err.message).toEqual('unknown');
                        return connection('users');
                    })
                    .then(function (values) {
                        if (_private.isBetterSQLite3()) {
                            return;
                        }

                        throw new Error('users table should not exist.');
                    })
                    .catch(function (err) {
                        // table not found
                        _private.assertTableMissingError(err);
                    });
            });
        });

        describe('success #1', function () {
            beforeAll(function () {
                migratorConfigPath = path.join(
                    __dirname,
                    '..',
                    'assets',
                    'migrations_3',
                    'MigratorConfig.js',
                );
                migrationPath = path.join(__dirname, '..', 'assets', 'migrations_3');

                testUtils.writeMigratorConfig({
                    migratorConfigPath: migratorConfigPath,
                    migrationPath: migrationPath,
                    currentVersion: '1.0',
                });

                knexMigrator = new KnexMigrator({
                    knexMigratorFilePath: migrationPath,
                });

                connection = testUtils.connect();

                return knexMigrator.reset();
            });

            afterAll(function () {
                if (fs.existsSync(migratorConfigPath)) {
                    fs.unlinkSync(migratorConfigPath);
                }
            });

            it('expect no rollback', function () {
                return knexMigrator
                    .init()
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(2);

                        return connection('migrations');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(5);
                    });
            });
        });
    });

    describe('knex-migrator migrate', function () {
        describe('fail #1', function () {
            beforeAll(function () {
                migratorConfigPath = path.join(
                    __dirname,
                    '..',
                    'assets',
                    'migrations_4',
                    'MigratorConfig.js',
                );
                migrationPath = path.join(__dirname, '..', 'assets', 'migrations_4');

                testUtils.writeMigratorConfig({
                    migratorConfigPath: migratorConfigPath,
                    migrationPath: migrationPath,
                    currentVersion: '1.0',
                });

                knexMigrator = new KnexMigrator({
                    knexMigratorFilePath: migrationPath,
                });

                connection = testUtils.connect();

                return knexMigrator.reset();
            });

            afterAll(function () {
                if (fs.existsSync(migratorConfigPath)) {
                    fs.unlinkSync(migratorConfigPath);
                }
            });

            it('expect full DDL/DML rollback', function () {
                return knexMigrator
                    .init({ skipInitCompletion: true })
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        // from init
                        expect(values.length).toEqual(1);
                        expect(Object.prototype.hasOwnProperty.call(values[0], 'country')).toEqual(
                            false,
                        );

                        return knexMigrator.migrate({ force: true });
                    })
                    .then(function () {
                        throw new Error('Expect error from migrate.');
                    })
                    .catch(function (err) {
                        expect(err.message).toEqual('Ooops');

                        return connection('dogs');
                    })
                    .then(function (values) {
                        if (_private.isBetterSQLite3()) {
                            return connection('users');
                        }

                        throw new Error('dogs table should not exist');
                    })
                    .catch(function (err) {
                        // table not found
                        _private.assertTableMissingError(err);

                        return connection('users');
                    })
                    .then(function (values) {
                        // from init
                        expect(values.length).toEqual(1);

                        expect(Object.prototype.hasOwnProperty.call(values[0], 'country')).toEqual(
                            false,
                        );
                    });
            });
        });

        describe('success #1', function () {
            beforeAll(function () {
                migratorConfigPath = path.join(
                    __dirname,
                    '..',
                    'assets',
                    'migrations_5',
                    'MigratorConfig.js',
                );
                migrationPath = path.join(__dirname, '..', 'assets', 'migrations_5');

                testUtils.writeMigratorConfig({
                    migratorConfigPath: migratorConfigPath,
                    migrationPath: migrationPath,
                    currentVersion: '1.0',
                });

                knexMigrator = new KnexMigrator({
                    knexMigratorFilePath: migrationPath,
                });

                connection = testUtils.connect();

                return knexMigrator.reset();
            });

            afterAll(function () {
                if (fs.existsSync(migratorConfigPath)) {
                    fs.unlinkSync(migratorConfigPath);
                }
            });

            it('expect no rollback', function () {
                return knexMigrator
                    .init({ skipInitCompletion: true })
                    .then(function () {
                        return knexMigrator.migrate({ force: true });
                    })
                    .then(function () {
                        return connection('users');
                    })
                    .then(function (values) {
                        // from init
                        expect(values.length).toEqual(3);
                        expect(Object.prototype.hasOwnProperty.call(values[0], 'country')).toEqual(
                            true,
                        );

                        return connection('dogs');
                    })
                    .then(function (values) {
                        expect(values.length).toEqual(1);
                    });
            });
        });
    });
});
