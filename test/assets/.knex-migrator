#!/usr/bin/env node

var path = require('path');

module.exports = {
    database: {
        client: 'sqlite3',
        connection: {
            filename: path.join(process.cwd(), 'test/assets/test.db')
        }
    },
    migrationPath: path.join(process.cwd(), 'test/assets/migrations'),
    currentVersion: '1.4'
}