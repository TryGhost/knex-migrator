const utils = require('../../lib/utils');
const should = require('should');
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

            utils
                .loadConfig({
                    knexMigratorConfig: config,
                })
                .should.eql(config);
        });

        it('throws a helpful error when MigratorConfig.js is missing', function () {
            try {
                utils.loadConfig({
                    knexMigratorFilePath: path.join(__dirname, 'missing-config'),
                });
                true.should.eql(false);
            } catch (err) {
                should.not.exist(err.code);
                err.message.should.eql(
                    'Please provide a file named MigratorConfig.js in your project root.',
                );
            }
        });

        it('does not hide missing dependencies from MigratorConfig.js', function () {
            const configPath = path.join(__dirname, 'fixtures', 'broken-config');

            try {
                utils.loadConfig({
                    knexMigratorFilePath: configPath,
                });
                true.should.eql(false);
            } catch (err) {
                err.message.should.not.eql(
                    'Please provide a file named MigratorConfig.js in your project root.',
                );
                err.code.should.eql('MODULE_NOT_FOUND');
                err.stack.should.match(/Cannot find module 'missing-config-dependency'/);
            }
        });
    });

    describe('getKnexMigrator', function () {
        it('resolves with path to installation of knex-migrator', function (done) {
            utils.getKnexMigrator({ path: process.cwd() }).then((constructor) => {
                constructor.name.should.eql('KnexMigrator');
                done();
            });
        });
    });

    describe('isGreaterThanVersion', function () {
        it('version has this notation: 1.1', function () {
            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.1',
                    smallerVersion: '1.0',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '2.0',
                    smallerVersion: '1.0',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.0',
                    smallerVersion: '2.0',
                })
                .should.eql(false);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.11',
                    smallerVersion: '1.4',
                })
                .should.eql(true);
        });

        it('version has this notation: 11', function () {
            utils
                .isGreaterThanVersion({
                    greaterVersion: '11',
                    smallerVersion: '10',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '20',
                    smallerVersion: '10',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '10',
                    smallerVersion: '20',
                })
                .should.eql(false);
        });

        it('version has this notation: 11 (INT)', function () {
            utils
                .isGreaterThanVersion({
                    greaterVersion: 11,
                    smallerVersion: 10,
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: 20,
                    smallerVersion: 10,
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: 10,
                    smallerVersion: 20,
                })
                .should.eql(false);
        });

        it('version has this notation: 1.1.1', function () {
            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.1.2',
                    smallerVersion: '1.1.1',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '2.0.0',
                    smallerVersion: '1.0.0',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.0.0',
                    smallerVersion: '2.0.0',
                })
                .should.eql(false);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '2.0.0',
                    smallerVersion: '1.0.10',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.10.0',
                    smallerVersion: '1.2.0',
                })
                .should.eql(true);
        });

        it('version has this notation: 1', function () {
            utils
                .isGreaterThanVersion({
                    greaterVersion: '1',
                    smallerVersion: '1',
                })
                .should.eql(false);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '2',
                    smallerVersion: '1',
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1',
                    smallerVersion: '2',
                })
                .should.eql(false);
        });
    });

    describe('readFolders', function () {
        it('ensure order', function () {
            sinon.stub(fs, 'readdirSync').returns(['1.0', '2.0', '2.3', '2.13']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            folders.should.eql(['1.0', '2.0', '2.3', '2.13']);
        });

        it('ensure order', function () {
            sinon.stub(fs, 'readdirSync').returns(['1.1.2', '1.1.0', '0.1']);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            folders.should.eql(['0.1', '1.1.0', '1.1.2']);
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

            folders.should.eql([
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
            folders.should.eql(['1.0']);
        });

        it('returns an empty folder list directly', function () {
            sinon.stub(fs, 'readdirSync').returns([]);
            let folders = utils.readVersionFolders(
                path.join(__dirname, 'assets', 'migrations', 'versions'),
            );
            folders.should.eql([]);
        });
    });

    describe('listFiles', function () {
        it('ignores dot files', function () {
            sinon.stub(fs, 'readdirSync').returns(['.hidden', '1-test.js']);
            utils.listFiles('migrations').should.eql(['1-test.js']);
        });

        it('throws a migration path error when the directory is missing', function () {
            sinon.stub(fs, 'readdirSync').throws(new Error('missing'));

            try {
                utils.listFiles('missing');
                true.should.eql(false);
            } catch (err) {
                err.code.should.eql('MIGRATION_PATH');
                err.message.should.eql('MigrationPath is wrong: missing');
            }
        });
    });
});
