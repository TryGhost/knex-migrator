const path = require('path'),
    sinon = require('sinon'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

describe('knex-migrator rollback (on init, auto-rollback)', function () {
    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_7'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        connection;

    beforeAll(function () {
        testUtils.writeMigratorConfig({
            migratorConfigPath: migratorConfigPath,
            migrationPath: migrationPath,
            currentVersion: '1.20',
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
            .then(function () {
                expect.unreachable();
            })
            .catch(function (err) {
                expect(err.help).toEqual(
                    'Error occurred while executing the following migration: 2-seed.js',
                );
            });
    });

    it('knex-migrator health', function () {
        return knexMigrator
            .isDatabaseOK()
            .then(function () {
                expect.unreachable();
            })
            .catch(function (err) {
                expect(err.message).toEqual('Please run `pnpm knex-migrator init`');
            });
    });

    it('db check', function () {
        return connection('migrations').then(function (migrations) {
            expect(migrations.length).toEqual(0);
        });
    });
});
