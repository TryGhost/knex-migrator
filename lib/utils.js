var path = require('path'),
    _ = require('lodash'),
    fs = require('fs'),
    Promise = require('bluebird'),
    resolve = Promise.promisify(require('resolve')),
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

/**
 * auto detect local installation to avoid version incompatible behaviour
 */
exports.getKnexMigrator = function getKnexMigrator(options) {
    options = options || {};

    return resolve('knex-migrator', {basedir: options.path})
        .then(function (localCLIPath) {
            return require(localCLIPath);
        })
        .catch(function () {
            return require('./');
        });
};
