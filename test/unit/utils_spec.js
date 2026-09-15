const utils = require('../../lib/utils');
const fs = require('fs');
const sinon = require('sinon');
const path = require('path');

describe('Utils', function () {
    afterEach(function () {
        sinon.restore();
    });

    describe('loadConfig', function () {
        it('uses a provided config object directly', function () {
            const config = {
                database: {},
                migrationPath: 'migrations',
                currentVersion: '1.0',
            };

            expect(
                utils.loadConfig({
                    knexMigratorConfig: config,
                }),
            ).toEqual(config);
        });

        it('throws a helpful error when no config file is present', function () {
            try {
                utils.loadConfig({
                    knexMigratorFilePath: path.join(__dirname, 'missing-config'),
                });
                expect.unreachable();
            } catch (err) {
                expect(err.code).toBeOneOf([null, undefined]);
                expect(err.message).toEqual(
                    'Please provide a file named MigratorConfig.js, MigratorConfig.cjs, or MigratorConfig.mjs in your project root.',
                );
            }
        });

        it('loads a CommonJS config from MigratorConfig.cjs', function () {
            const configPath = path.join(__dirname, 'fixtures', 'cjs-config');

            expect(
                utils.loadConfig({
                    knexMigratorFilePath: configPath,
                }),
            ).toEqual({
                database: { client: 'sqlite3' },
                migrationPath: 'migrations',
                currentVersion: '1.0',
            });
        });

        it('loads an ESM config from MigratorConfig.mjs via its default export', function () {
            const configPath = path.join(__dirname, 'fixtures', 'mjs-config');

            expect(
                utils.loadConfig({
                    knexMigratorFilePath: configPath,
                }),
            ).toEqual({
                database: { client: 'sqlite3' },
                migrationPath: 'migrations',
                currentVersion: '1.0',
            });
        });

        it('does not hide missing dependencies from MigratorConfig.js', function () {
            const configPath = path.join(__dirname, 'fixtures', 'broken-config');

            try {
                utils.loadConfig({
                    knexMigratorFilePath: configPath,
                });
                expect.unreachable();
            } catch (err) {
                expect(err.message).not.toEqual(
                    'Please provide a file named MigratorConfig.js in your project root.',
                );
                expect(err.code).toEqual('MODULE_NOT_FOUND');
                expect(err.stack).toMatch(/Cannot find module 'missing-config-dependency'/);
            }
        });
    });

    describe('getKnexMigrator', function () {
        it('resolves with path to installation of knex-migrator', function () {
            return utils.getKnexMigrator({ path: process.cwd() }).then((constructor) => {
                expect(constructor.name).toEqual('KnexMigrator');
            });
        });
    });

    describe('isGreaterThanVersion', function () {
        it('version has this notation: 1.1', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.1',
                    smallerVersion: '1.0',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '2.0',
                    smallerVersion: '1.0',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.0',
                    smallerVersion: '2.0',
                }),
            ).toEqual(false);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.11',
                    smallerVersion: '1.4',
                }),
            ).toEqual(true);
        });

        it('version has this notation: 11', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '11',
                    smallerVersion: '10',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '20',
                    smallerVersion: '10',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '10',
                    smallerVersion: '20',
                }),
            ).toEqual(false);
        });

        it('version has this notation: 11 (INT)', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: 11,
                    smallerVersion: 10,
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: 20,
                    smallerVersion: 10,
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: 10,
                    smallerVersion: 20,
                }),
            ).toEqual(false);
        });

        it('version has this notation: 1.1.1', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.1.2',
                    smallerVersion: '1.1.1',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '2.0.0',
                    smallerVersion: '1.0.0',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.0.0',
                    smallerVersion: '2.0.0',
                }),
            ).toEqual(false);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '2.0.0',
                    smallerVersion: '1.0.10',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.10.0',
                    smallerVersion: '1.2.0',
                }),
            ).toEqual(true);
        });

        it('version has this notation: 1', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1',
                    smallerVersion: '1',
                }),
            ).toEqual(false);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '2',
                    smallerVersion: '1',
                }),
            ).toEqual(true);

            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1',
                    smallerVersion: '2',
                }),
            ).toEqual(false);
        });

        it('version has a suffix: 1.1-members', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: '1.10-members',
                    smallerVersion: '1.9',
                }),
            ).toEqual(true);
        });

        it('version is not parseable', function () {
            expect(
                utils.isGreaterThanVersion({
                    greaterVersion: 'members',
                    smallerVersion: '1.0',
                }),
            ).toEqual(false);
        });
    });

    describe('readFolders', function () {
        it('ensure order', function () {
            sinon.stub(fs, 'readdirSync').returns(['1.0', '2.0', '2.3', '2.13']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            expect(folders).toEqual(['1.0', '2.0', '2.3', '2.13']);
        });

        it('ensure order', function () {
            sinon.stub(fs, 'readdirSync').returns(['1.1.2', '1.1.0', '0.1']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            expect(folders).toEqual(['0.1', '1.1.0', '1.1.2']);
        });

        it('ensure order', function () {
            sinon
                .stub(fs, 'readdirSync')
                .returns([
                    '1.13',
                    '1.18',
                    '1.19',
                    '1.20',
                    '1.21',
                    '1.22',
                    '1.3',
                    '1.4',
                    '1.5',
                    '1.7',
                    '1.9',
                ]);

            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );

            expect(folders).toEqual([
                '1.3',
                '1.4',
                '1.5',
                '1.7',
                '1.9',
                '1.13',
                '1.18',
                '1.19',
                '1.20',
                '1.21',
                '1.22',
            ]);
        });

        it('ignores dot folders', function () {
            sinon.stub(fs, 'readdirSync').returns(['.DS_Store', '1.0']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            expect(folders).toEqual(['1.0']);
        });

        it('orders suffixed version folders', function () {
            sinon.stub(fs, 'readdirSync').returns(['1.10-members', '1.2', 'misc']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            expect(folders).toEqual(['1.2', '1.10-members', 'misc']);
        });

        it('returns an empty folder list directly', function () {
            sinon.stub(fs, 'readdirSync').returns([]);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            expect(folders).toEqual([]);
        });
    });

    describe('listFiles', function () {
        it('ignores dot files', function () {
            sinon.stub(fs, 'readdirSync').returns(['.hidden', '1-test.js']);
            expect(utils.listFiles('migrations')).toEqual(['1-test.js']);
        });

        it('throws a migration path error when the directory is missing', function () {
            sinon.stub(fs, 'readdirSync').throws(new Error('missing'));

            try {
                utils.listFiles('missing');
                expect.unreachable();
            } catch (err) {
                expect(err.code).toEqual('MIGRATION_PATH');
                expect(err.message).toEqual('MigrationPath is wrong: missing');
            }
        });
    });
});
