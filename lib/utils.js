var path = require('path'),
    _ = require('lodash'),
    fs = require('fs'),
    debug = require('debug')('knex-migrator:utils'),
    errors = require('./errors');

exports.readTasks = function readTasks(absolutePath) {
    var files = [],
        tasks = [];

    try {
        files = fs.readdirSync(absolutePath);
    } catch (err) {
        throw new errors.KnexMigrateError({message: 'MigrationPath is wrong: ' + absolutePath});
    }

    _.each(files, function (file) {
        tasks.push({
            execute: require(path.join(absolutePath, file)),
            name: file
        });
    });

    debug(files);
    return tasks;
};

exports.getPath = function getPath(options) {
    options = options || {};

    var migrationsPath = options.migrationPath || path.join(process.cwd(), '/migrations');

    switch (options.type) {
        case 'init':
            migrationsPath += '/init';
            break;
    }

    debug(migrationsPath);
    return migrationsPath;
};
