const path = require('path'),
    _ = require('lodash'),
    fs = require('fs'),
    compareVer = require('compare-ver'),
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

exports.readVersionFolders = function readFolders(absolutePath) {
    let folders = [],
        toReturn = [];

    try {
        folders = fs.readdirSync(absolutePath);
    } catch (err) {
        throw new errors.KnexMigrateError({
            message: 'MigrationPath is wrong: ' + absolutePath,
            code: 'READ_FOLDERS'
        });
    }

    if (!folders.length) {
        return folders;
    }

    folders.forEach((folderToAdd) => {
        let index = null;

        toReturn.forEach((existingElement, _index) => {
            if (index !== null) {
                return;
            }

            // CASE: folder to add is smaller, push before this element
            if (compareVer.gt(folderToAdd, existingElement) === -1) {
                index = _index;
            }
        });

        if (index === null) {
            if (!toReturn.length) {
                index = 0;
            } else {
                index = toReturn.length;
            }
        }

        toReturn.splice(index, 0, folderToAdd);
    });

    debug(toReturn);
    return toReturn;
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

    // Are they semver like strings?
    if (new RegExp(/\./g).test(greaterVersion) && new RegExp(/\./g).test(smallerVersion)) {
        // -1 less than, 0 equal, 1 greater than
        return compareVer.gt(greaterVersion, smallerVersion) === 1;
    }

    // Must be numbers / number like strings
    greaterVersion = Number(greaterVersion.toString());
    smallerVersion = Number(smallerVersion.toString());

    return greaterVersion > smallerVersion;
};
