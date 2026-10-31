import { defineConfig } from 'knex-migrator';

export default defineConfig({
    database: { client: 'sqlite3', connection: { filename: '/path/to/database.sqlite' } },
    migrationPath: '/path/to/project/migrations',
    currentVersion: '2.0',
});
