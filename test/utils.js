// DEFAULT env is sqlite3
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'test') {
    process.env.NODE_ENV = 'testing';
}

// Loaded for its side-effect: registers the global `.should` assertion getter.
// vitest-setup.mjs imports this file, so specs that don't require('should')
// themselves (e.g. bin_spec) still get `.should`.
require('should');

const fs = require('fs');
const config = require('./config');
const database = require('../lib/database');

exports.connect = function () {
    // Deep clone so the production connect helper (which aliases `sqlite3` to
    // `better-sqlite3` and applies driver defaults) can't mutate the shared config.
    return database.connect(JSON.parse(JSON.stringify(config.get('database'))));
};

exports.writeMigratorConfig = function writeMigratorConfig(options) {
    options = options || {};

    let migratorConfig = {
        database: config.get('database'),
        migrationPath: options.migrationPath,
        currentVersion: options.currentVersion,
    };

    fs.writeFileSync(
        options.migratorConfigPath,
        'module.exports = ' + JSON.stringify(migratorConfig) + ';',
        'utf-8',
    );
};

exports.generateMigrationScript = function (options) {
    let up = options.up,
        down = options.down;

    let script =
        'module.exports.up = function something(options) {' +
        'return options.connection.raw(' +
        JSON.stringify(up) +
        ');' +
        '};';

    if (options.down) {
        script +=
            'module.exports.down = function something(options) {' +
            'return options.connection.raw(' +
            JSON.stringify(down) +
            ');' +
            '};';
    }

    return script;
};
