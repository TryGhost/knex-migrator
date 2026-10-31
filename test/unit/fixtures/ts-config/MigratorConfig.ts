import { defineConfig } from '../../../../lib/index.js';

const currentVersion: string = '1.0';

export default defineConfig({
    database: { client: 'sqlite3' },
    migrationPath: 'migrations',
    currentVersion,
});
