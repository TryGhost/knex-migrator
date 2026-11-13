const database = require('../../lib/database'),
    errors = require('../../lib/errors'),
    fs = require('fs');

describe('Database', function () {
    let databaseFile = __dirname + '/knex-migrator-test.db',
        connection1,
        dbConfig = {
            client: 'sqlite3',
            connection: {
                filename: databaseFile,
            },
        };

    beforeEach(function () {
        connection1 = database.connect(dbConfig);

        return connection1.raw('CREATE TABLE test (a Int);');
    });

    afterEach(function () {
        if (!fs.existsSync(databaseFile)) {
            return;
        }

        fs.unlinkSync(databaseFile);
    });

    it('kill connection2 does not kill connection 1', function () {
        const connection2 = database.connect(dbConfig);

        return connection1.destroy().then(function () {
            return connection2.raw('SELECT * from test;');
        });
    });

    it('ensure test connection works', function () {
        const connection2 = database.connect({
            client: 'mysql',
            connection: {
                host: 'unknown',
            },
        });

        return database
            .ensureConnectionWorks(connection2)
            .then(() => {
                expect.unreachable('Test should fail.');
            })
            .catch((err) => {
                expect(err instanceof errors.DatabaseError).toBe(true);
                expect(err.message).toEqual('Invalid database host.');
            });
    });

    it('ensure test connection works', function () {
        const connection2 = database.connect({
            client: 'sqlite3',
            connection: {
                filename: databaseFile,
            },
        });

        return database.ensureConnectionWorks(connection2);
    });
});

describe('KnexMigrator with a frozen database config', function () {
    const KnexMigrator = require('../../lib');
    const config = require('../config');
    const os = require('os');
    const path = require('path');

    let migrationPath;

    function deepFreeze(value) {
        Object.values(value).forEach(function (child) {
            if (child && typeof child === 'object') {
                deepFreeze(child);
            }
        });

        return Object.freeze(value);
    }

    beforeAll(function () {
        migrationPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knex-migrator-frozen-config-'));
        fs.mkdirSync(path.join(migrationPath, 'init'));
        fs.writeFileSync(
            path.join(migrationPath, 'init', '1-create-tables.js'),
            "module.exports.up = function up(options) {\n    return options.connection.raw('CREATE TABLE users (name VARCHAR(100));');\n};\n",
        );
    });

    afterAll(function () {
        fs.rmSync(migrationPath, { recursive: true, force: true });
    });

    it('runs init, health and reset without mutating the config', async function () {
        const database = deepFreeze(structuredClone(config.get('database')));
        const snapshot = structuredClone(database);
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database,
                migrationPath,
                currentVersion: '1.0',
            },
        });

        await knexMigrator.reset({ force: true });

        try {
            await knexMigrator.init();
            await knexMigrator.isDatabaseOK();
        } finally {
            await knexMigrator.reset({ force: true });
        }

        expect(database).toEqual(snapshot);
    });
});
