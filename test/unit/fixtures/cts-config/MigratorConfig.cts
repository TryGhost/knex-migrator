const { defineConfig } = require('../../../../lib');

const currentVersion: string = '1.0';

module.exports = defineConfig({
    database: { client: 'sqlite3' },
    migrationPath: 'migrations',
    currentVersion,
});
