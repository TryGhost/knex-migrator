const path = require('path'),
    sinon = require('sinon'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

describe('knex-migrator rollback (to specific version)', function () {
    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_6'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        versionsFolder = path.join(__dirname, '..', 'assets', 'migrations_6', 'versions'),
        migrations = [],
        connection;

    beforeAll(function () {
        if (fs.existsSync(versionsFolder)) {
            rimraf.sync(versionsFolder);
        }

        testUtils.writeMigratorConfig({
            migratorConfigPath: migratorConfigPath,
            migrationPath: migrationPath,
            currentVersion: '1.2',
        });

        knexMigrator = new KnexMigrator({
            knexMigratorFilePath: path.join(__dirname, '..', 'assets'),
        });
    });

    beforeAll(function () {
        return knexMigrator.reset();
    });

    beforeAll(function () {
        connection = testUtils.connect();
    });

    afterAll(async function () {
        if (connection) {
            await connection.destroy();
        }

        if (fs.existsSync(versionsFolder)) {
            rimraf.sync(versionsFolder);
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

    it('knex-migrator init', function () {
        return knexMigrator
            .init()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                expect(values.length).toEqual(2);
                expect(values[0].currentVersion).toEqual('1.2');
                expect(values[1].currentVersion).toEqual('1.2');
            });
    });

    it('add', function () {
        migrations.push(
            {
                folder: versionsFolder + '/1.3',
                file: '1-test.js',
            },
            {
                folder: versionsFolder + '/1.4',
                file: '1-test.js',
            },
            {
                folder: versionsFolder + '/1.6',
                file: '1-test.js',
            },
            {
                folder: versionsFolder + '/1.11',
                file: '1-test.js',
            },
            {
                folder: versionsFolder + '/1.20',
                file: '1-test.js',
            },
        );

        fs.mkdirSync(versionsFolder);
        migrations.forEach((migration) => {
            fs.mkdirSync(migration.folder);

            let jsFile = testUtils.generateMigrationScript({
                up: "UPDATE users set name='Kind';",
                down: "UPDATE users set name='Hausmann';",
            });

            fs.writeFileSync(migration.folder + '/' + migration.file, jsFile);
        });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.4';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator
            .migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                expect(values.length).toEqual(4);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.5';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator
            .migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                expect(values.length).toEqual(4);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.8';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator
            .migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                expect(values.length).toEqual(5);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.20';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator
            .migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                expect(values.length).toEqual(7);
            });
    });

    it('knex-migrator rollback', function () {
        return knexMigrator
            .rollback({ force: true, version: '1.11.3' })
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                expect(values.length).toEqual(6);
            });
    });

    it('knex-migrator health', function () {
        return knexMigrator
            .isDatabaseOK()
            .then(() => {
                expect.unreachable();
            })
            .catch((err) => {
                expect(err).toEqual(expect.anything());

                // current version is still 1.20 and you rolled back the migration scripts till 1.11
                expect(err.code).toEqual('DB_NEEDS_MIGRATION');
            });
    });

    it('knex-migrator rollback', function () {
        return knexMigrator
            .rollback({ force: true, version: '1.2' })
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                expect(values.length).toEqual(2);
            });
    });
});
