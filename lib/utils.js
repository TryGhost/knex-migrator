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
        try {
            tasks.push({
                execute: require(path.join(absolutePath, file)),
                name: file
            });
        } catch (err) {
            debug(err.message);
        }
    });

    debug(files);
    return tasks;
};

exports.readFolders = function readFolders(absolutePath) {
    var folders = [];

    try {
        folders = fs.readdirSync(absolutePath);
    } catch (err) {
        throw new errors.KnexMigrateError({message: 'MigrationPath is wrong: ' + absolutePath});
    }

    debug(folders);
    return folders;
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
