const path = require('path'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    utils = require('../../lib/utils'),
    testUtils = require('../utils');

// A migration that runs from its TypeScript source, then from its compiled
// output, against the same database: it must keep one name and run once.
describe.runIf(utils.supportsTypeScript())(
    'knex-migrator TypeScript source to compiled output',
    function () {
        let knexMigrator,
            connection,
            migrationPath = path.join(__dirname, '..', 'assets', 'migrations_8'),
            migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
            versionsFolder = path.join(migrationPath, 'versions'),
            versionFolder = path.join(versionsFolder, '1.1'),
            sourceFile = path.join(versionFolder, '1-add-user.ts'),
            compiledFile = path.join(versionFolder, '1-add-user.js');

        function writeMigration(file, user) {
            const annotation = file.endsWith('.ts') ? ': string' : '';

            fs.writeFileSync(
                file,
                `const user${annotation} = '${user}';
module.exports.up = function up(options) {
    return options.connection('users').insert({name: user});
};
module.exports.down = function down(options) {
    return options.connection('users').where({name: user}).del();
};
`,
            );
        }

        async function users() {
            return (await connection('users').select('name')).map((row) => row.name);
        }

        async function versionMigrations() {
            return (await connection('migrations').whereNot('version', 'init').select('name')).map(
                (row) => row.name,
            );
        }

        beforeAll(async function () {
            rimraf.sync(versionsFolder);

            testUtils.writeMigratorConfig({
                migratorConfigPath,
                migrationPath,
                currentVersion: '1.1',
            });

            knexMigrator = new KnexMigrator({
                knexMigratorFilePath: path.join(__dirname, '..', 'assets'),
            });

            await knexMigrator.reset();
            connection = testUtils.connect();
            await knexMigrator.init();
        });

        afterAll(async function () {
            if (connection) {
                await connection.destroy();
            }

            rimraf.sync(versionsFolder);

            if (fs.existsSync(migratorConfigPath)) {
                fs.unlinkSync(migratorConfigPath);

                for (const key of Object.keys(require.cache)) {
                    if (key.match(/assets\/MigratorConfig\.js/) || key.startsWith(versionsFolder)) {
                        delete require.cache[key];
                    }
                }
            }
        });

        it('runs the source migration under its compiled name', async function () {
            fs.mkdirSync(versionFolder, { recursive: true });
            writeMigration(sourceFile, 'source');

            await knexMigrator.migrate();

            expect(await versionMigrations()).toEqual(['1-add-user.js']);
            expect(await users()).toEqual(['source']);
        });

        it('does not run it again once the compiled output sits beside the source', async function () {
            writeMigration(compiledFile, 'compiled');

            await knexMigrator.migrate();
            await knexMigrator.isDatabaseOK();

            expect(await versionMigrations()).toEqual(['1-add-user.js']);
            expect(await users()).toEqual(['source']);
        });

        it('does not run it again once only the compiled output ships', async function () {
            fs.unlinkSync(sourceFile);

            await knexMigrator.migrate();
            await knexMigrator.isDatabaseOK();

            expect(await versionMigrations()).toEqual(['1-add-user.js']);
            expect(await users()).toEqual(['source']);
        });

        it('rolls back the recorded migration through the compiled output', async function () {
            // the compiled down only removes its own row, proving which file ran
            await connection('users').insert({ name: 'compiled' });

            await knexMigrator.rollback({ force: true, version: '1.0' });

            expect(await versionMigrations()).toEqual([]);
            expect(await users()).toEqual(['source']);
        });
    },
);
