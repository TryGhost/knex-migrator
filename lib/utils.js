'use strict';

const path = require('path'),
    _ = require('lodash'),
    fs = require('fs'),
    Promise = require('bluebird'),
    resolve = Promise.promisify(require('resolve')),
    debug = require('debug')('knex-migrator:utils'),
    errors = require('./errors');

exports.readTasks = function readTasks(absolutePath) {
    let files = [],
        tasks = [];

    try {
        files = fs.readdirSync(absolutePath);
    } catch (err) {
        throw new errors.KnexMigrateError({
            code: 'MIGRATION_PATH',
            message: 'MigrationPath is wrong: ' + absolutePath
        });
    }

    _.each(files, function (file) {
        // CASE: ignore dot files
        if (file.match(/^\./)) {
            debug('Ignore Dotfile: ' + file);
            return;
        }

        let executeFn = require(path.join(absolutePath, file));

        try {
            tasks.push({
                up: executeFn.up,
                down: executeFn.down,
                config: executeFn.config,
                name: file
            });
        } catch (err) {
            debug(err.message);

            throw new errors.MigrationScript({
                message: err.message,
                help: 'Cannot load Migrationscript.',
                context: file
            });
        }
    });

    debug(files);
    return tasks;
};

exports.readFolders = function readFolders(absolutePath) {
    let folders = [];

    try {
        folders = fs.readdirSync(absolutePath);
    } catch (err) {
        throw new errors.KnexMigrateError({
            message: 'MigrationPath is wrong: ' + absolutePath,
            code: 'READ_FOLDERS'
        });
    }

    // NOTE: always return folders sorted
    folders = folders.sort(function (a, b) {
        let aInt = parseInt(a.replace(/\./g, ''));
        let bInt = parseInt(b.replace(/\./g, ''));

        // CASE: read folders without numbers/versions
        if (isNaN(aInt) || isNaN(bInt)) {
            return a > b;
        }

        return aInt > bInt;
    });

    debug(folders);
    return folders;
};

exports.getPath = function getPath(options) {
    options = options || {};

    let migrationsPath = options.migrationPath || path.join(process.cwd(), '/migrations');

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

/**
 * valid versions
 *
 * 1
 * 1.1
 * 1.1.0
 */
exports.isGreaterThanVersion = function isGreaterThanVersion(options) {
    let greaterVersion = options.greaterVersion;
    let smallerVersion = options.smallerVersion;

    greaterVersion = Number(greaterVersion.toString().replace(/\./g, ''));
    smallerVersion = Number(smallerVersion.toString().replace(/\./g, ''));

    return greaterVersion > smallerVersion;
};
