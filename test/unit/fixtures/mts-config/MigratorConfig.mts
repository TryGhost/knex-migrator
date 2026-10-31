import type KnexMigrator from '../../../../lib/index.js';

const config: KnexMigrator.Config = {
    database: { client: 'sqlite3' },
    migrationPath: 'migrations',
    currentVersion: '1.0',
};

export default config;
