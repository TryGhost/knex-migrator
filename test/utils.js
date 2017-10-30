'use strict';

// DEFAULT env is sqlite3
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'testing';
}

const knex = require('knex');
const fs = require('fs');
const config = require('ghost-ignition').config();

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
