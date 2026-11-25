const path = require('path'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

describe('knex-migrator rollback (on migrate, previously applied migrations)', function () {
    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_9'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        versionsFolder = path.join(migrationPath, 'versions'),
        connection;

    const writeMigration = function (version, file, script) {
        const folder = path.join(versionsFolder, version);

        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, file), testUtils.generateMigrationScript(script));
    };

    const insertUser = function (name) {
        return {
            up: `INSERT INTO users (name) VALUES('${name}');`,
            down: `DELETE FROM users WHERE name='${name}';`,
        };
    };

    const broken = {
        up: "INSERT INTO does_not_exist (name) VALUES('nope');",
        down: "DELETE FROM users WHERE name='nope';",
    };

    const userNames = async function () {
        const users = await connection('users').orderBy('name');
        return users.map((user) => user.name);
    };

    const migrationNames = async function () {
        const migrations = await connection('migrations')
            .whereNot('version', 'init')
            .orderBy(['version', 'name']);
        return migrations.map((migration) => `${migration.version}/${migration.name}`);
    };

    beforeAll(function () {
        if (fs.existsSync(versionsFolder)) {
            rimraf.sync(versionsFolder);
        }

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

    it('applies the first migration of a version', async function () {
        await knexMigrator.init();

        writeMigration('1.0', '1-first.js', insertUser('first'));
        await knexMigrator.migrate();

        expect(await userNames()).toEqual(['first']);
        expect(await migrationNames()).toEqual(['1.0/1-first.js']);
    });

    it('keeps migrations applied by an earlier run when a later one in the same version fails', async function () {
        writeMigration('1.0', '2-second.js', insertUser('second'));
        writeMigration('1.0', '3-broken.js', broken);

        await expect(knexMigrator.migrate()).rejects.toMatchObject({
            help: 'Error occurred while executing the following migration: 3-broken.js',
        });

        expect(await userNames()).toEqual(['first']);
        expect(await migrationNames()).toEqual(['1.0/1-first.js']);
    });

    it('keeps migrations applied by an earlier run when a later version fails', async function () {
        fs.unlinkSync(path.join(versionsFolder, '1.0', '3-broken.js'));
        writeMigration('1.1', '1-broken.js', broken);
        knexMigrator.currentVersion = '1.1';

        await expect(knexMigrator.migrate()).rejects.toMatchObject({
            help: 'Error occurred while executing the following migration: 1-broken.js',
        });

        expect(await userNames()).toEqual(['first']);
        expect(await migrationNames()).toEqual(['1.0/1-first.js']);
    });
});
