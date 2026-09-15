import KnexMigrator = require('knex-migrator');

const fromPath = new KnexMigrator({ knexMigratorFilePath: process.cwd() });
const fromConfig = new KnexMigrator({
    knexMigratorConfig: {
        database: {
            client: 'sqlite3',
            connection: {
                filename: '/path/to/database.sqlite',
            },
        },
        migrationPath: '/path/to/project/migrations',
        currentVersion: '2.0',
        subfolder: 'versions',
    },
});
new KnexMigrator();

async function run(): Promise<void> {
    await fromPath.init();
    await fromPath.init({ only: 1, skip: '2', disableHooks: true, noScripts: false });
    await fromPath.migrate({ version: '2.0', force: true, init: true, only: 1 });
    await fromConfig.rollback({ force: true, v: '1.0', disableHooks: true });
    await fromConfig.reset({ force: true });
    await fromConfig.isDatabaseOK();

    const version: string = fromPath.currentVersion;
    void version;

    // @ts-expect-error version must be a string
    await fromPath.migrate({ version: 2 });

    // @ts-expect-error a non-numeric index coerces to NaN at runtime
    await fromPath.init({ only: 'first' });

    // @ts-expect-error a non-numeric index coerces to NaN at runtime
    await fromPath.init({ skip: 'first' });
}
void run;

// @ts-expect-error config requires migrationPath and currentVersion
new KnexMigrator({ knexMigratorConfig: { database: {} } });

const migration: KnexMigrator.Migration = {
    config: { transaction: true, irreversible: false },
    async up({ transacting, connection }) {
        const knex = transacting || connection!;
        await knex.schema.createTable('events', (table) => {
            table.increments('id').primary();
        });
    },
    async down({ transacting, connection }) {
        await (transacting || connection!).schema.dropTable('events');
    },
};
void migration;

const hooks: KnexMigrator.Hooks = {
    async before({ connection }) {
        await connection.raw('SELECT 1');
    },
    shutdown({ executedFromShell }) {
        const fromShell: boolean | undefined = executedFromShell;
        void fromShell;
    },
};
void hooks;
