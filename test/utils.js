'use strict';

// DEFAULT env is sqlite3
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'testing';
}

const knex = require('knex');
const fs = require('fs');
const config = require('../config');

exports.connect = function () {
    return knex(config.get('database'));
};

exports.writeMigratorConfig = function writeMigratorConfig(options) {
    options = options || {};

    let migratorConfig = {
        database: config.get('database'),
        migrationPath: options.migrationPath,
        currentVersion: options.currentVersion
    };

    fs.writeFileSync(options.migratorConfigPath, 'module.exports = ' + JSON.stringify(migratorConfig) + ';', 'utf-8');
};

exports.generateMigrationScript = function (options) {
    let up = options.up,
        down = options.down;

    let script = 'module.exports.up = function something(options) {' +
        'return options.connection.raw(\'' + up + '\');' +
        '};';

    if (options.down) {
        script += 'module.exports.down = function something(options) {' +
            'return options.connection.raw(\'' + down + '\');' +
            '};';
    }

    return script;
};
