const path = require('path'),
    sinon = require('sinon'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    config = require('../config'),
    errors = require('../../lib/errors'),
    testUtils = require('../utils');

describe('Functional flow: Edge Cases', function () {
    let knexMigrator,
        basePath = path.join(__dirname, '..', 'assets', 'migrations'),
        migrationPath = basePath,
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        connection;

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

    it('run init, but process gets destroyed', function () {
        return knexMigrator
            .init()
            .then(function () {
                return connection('migrations');
            })
            .then((response) => {
                expect(response.length).toEqual(3);

                return connection('migrations').where('name', '1-another.js').delete();
            })
            .then(function () {
                return connection('migrations');
            })
            .then(function (response) {
                expect(response.length).toEqual(2);

                return connection('migrations').where('name', '2-seed.js').delete();
            })
            .then(function () {
                return connection('migrations');
            })
            .then(function (response) {
                expect(response.length).toEqual(1);
                return knexMigrator.init();
            })
            .then(() => {
                return connection('migrations');
            })
            .then(function (response) {
                expect(response.length).toEqual(3);
            });
    });
});
