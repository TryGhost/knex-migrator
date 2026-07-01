const path = require('path');
const fs = require('fs');
const compareVer = require('compare-ver');
const resolve = require('util').promisify(require('resolve'));
const debug = require('debug')('knex-migrator:utils');
const errors = require('./errors');

/**
 * @description This helper function offers two ways of loading the knex-migrator configuration.
 *
 * 1. via JS object
 * 2. via file location
 *
 * The expected format is:
 *
 * {
 *   database: Object,
 *   migrationPath: String,
 *   currentVersion: String
 * }
 *
 * @param {Object} options
 * @returns {*}
 */
module.exports.loadConfig = function loadConfig(options) {
    if (options.knexMigratorConfig) {
        return options.knexMigratorConfig;
    }

    const knexMigratorFilePath = options.knexMigratorFilePath || process.cwd();
    const configPath = path.join(path.resolve(knexMigratorFilePath), 'MigratorConfig.js');
    let resolvedConfigPath;

    try {
        resolvedConfigPath = require.resolve(configPath);
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            throw new errors.KnexMigrateError({
                message: 'Please provide a file named MigratorConfig.js in your project root.',
                help: 'Read through the README.md to see which values are expected.',
            });
        }

        throw new errors.KnexMigrateError({ err: err });
    }

    try {
        return require(resolvedConfigPath);
    } catch (err) {
        throw new errors.KnexMigrateError({ err: err });
    }
};

/**
 * @description List all migration files from disk based on a path.
 *
 * @param absolutePath
 * @returns {Array}
 */
exports.listFiles = function listFiles(absolutePath) {
    let files = [];

    try {
        files = fs.readdirSync(absolutePath);
    } catch {
        throw new errors.KnexMigrateError({
            code: 'MIGRATION_PATH',
            message: 'MigrationPath is wrong: ' + absolutePath,
        });
    }

    files = files.filter((file) => {
        // CASE: ignore dot files
        return !file.match(/^\./);
    });

    debug(files);
    return files;
};

/**
 * @description Reads all migration files from disk based on a path.
 * It returns an Array of migration files including it's up/down hooks, config and the name.
 *
 * @param absolutePath
 * @returns {Array}
 */
exports.readTasks = function readTasks(absolutePath) {
    const files = exports.listFiles(absolutePath);
    const tasks = files.map((file) => {
        const executeFn = require(path.join(absolutePath, file));

        try {
            return {
                up: executeFn.up,
                down: executeFn.down,
                config: executeFn.config,
                name: file,
            };
        } catch (err) {
            debug(err.message);

            throw new errors.MigrationScript({
                message: err.message,
                help: 'Cannot load Migrationscript.',
                context: file,
            });
        }
    });

    debug(tasks);
    return tasks;
};

/**
 * @description Reads all version folders from disk in correct order.
 *
 * @param absolutePath
 * @returns {*}
 */
exports.readVersionFolders = function readFolders(absolutePath) {
    let folders = [];
    const toReturn = [];

    try {
        folders = fs.readdirSync(absolutePath);
    } catch {
        throw new errors.KnexMigrateError({
            message: 'MigrationPath is wrong: ' + absolutePath,
            code: 'READ_FOLDERS',
        });
    }

    if (!folders.length) {
        return folders;
    }

    folders.forEach((folderToAdd) => {
        let index = null;

        // CASE: ignore dot files
        if (folderToAdd.match(/^\./)) {
            debug('Ignore Dotfile: ' + folderToAdd);
            return;
        }

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

/**
 * @description Auto detect local installation to avoid version incompatible behaviour
 */
exports.getKnexMigrator = async function getKnexMigrator(options) {
    options = options || {};

    try {
        const localCLIPath = await resolve('knex-migrator', { basedir: options.path });
        return require(localCLIPath);
    } catch {
        return require('./');
    }
};

/**
 * @description A helper function to figure out if a version is greater than another version.
 *
 * Valid versions are:
 * - 1
 * - 1.1
 * - 1.1.0
 *
 * It's up to you which pattern you would like to use.
 *
 * @param options
 * @returns {boolean}
 */
exports.isGreaterThanVersion = function isGreaterThanVersion(options) {
    let greaterVersion = options.greaterVersion;
    let smallerVersion = options.smallerVersion;

    // CASE: are they semver like strings?
    if (new RegExp(/\./g).test(greaterVersion) && new RegExp(/\./g).test(smallerVersion)) {
        // -1 less than, 0 equal, 1 greater than
        return compareVer.gt(greaterVersion, smallerVersion) === 1;
    }

    // CASE: must be numbers / number like strings
    greaterVersion = Number(greaterVersion.toString());
    smallerVersion = Number(smallerVersion.toString());

    return greaterVersion > smallerVersion;
};
