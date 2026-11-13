const path = require('path');
const fs = require('fs');
const semver = require('semver');
const debug = require('debug')('knex-migrator:utils');
const errors = require('./errors');

/**
 * @description Migration versions are loose (`1`, `1.1`, `1.1-members`), so coerce them to semver.
 * Returns null when the value does not contain a version number.
 */
function coerceVersion(version) {
    return semver.coerce(String(version));
}

/**
 * @description The config file basenames we look for, in resolution order.
 *
 * `.mjs` and `.cjs` are supported alongside the historical `.js`. ESM configs
 * are loaded synchronously via `require()`, so they must not use top-level
 * await.
 *
 * `.ts`, `.cts` and `.mts` configs are loaded with Node's built-in type
 * stripping (on by default in every supported Node.js version), so they are
 * subject to the same synchronous loading rules and may only use erasable
 * TypeScript syntax.
 */
const CONFIG_FILENAMES = [
    'MigratorConfig.js',
    'MigratorConfig.cjs',
    'MigratorConfig.mjs',
    'MigratorConfig.ts',
    'MigratorConfig.cts',
    'MigratorConfig.mts',
];

const TYPESCRIPT_EXTENSIONS = ['.ts', '.cts', '.mts'];

/**
 * @description Whether this Node process can `require()` TypeScript files.
 *
 * `process.features.typescript` is `'strip'` or `'transform'` when type
 * stripping is enabled, and `false` when it has been turned off (e.g. with
 * `--no-experimental-strip-types`).
 *
 * @returns {boolean}
 */
module.exports.supportsTypeScript = function supportsTypeScript() {
    return Boolean(process.features.typescript);
};

/**
 * @description Unwrap the default export from a loaded config or migration module.
 *
 * `require()`-ing an ESM module (a `.mjs`/`.mts` file, or a `.js`/`.ts` file in a
 * `"type": "module"` package) returns a Module namespace object. When it has a
 * `default` export, that holds the config or migration. A module with only named
 * exports, and any CommonJS module, is returned as loaded.
 *
 * @param {*} loaded
 * @returns {*}
 */
function interopDefault(loaded) {
    if (loaded && loaded[Symbol.toStringTag] === 'Module' && 'default' in loaded) {
        return loaded.default;
    }

    return loaded;
}

/**
 * @description This helper function offers two ways of loading the knex-migrator configuration.
 *
 * 1. via JS object
 * 2. via file location (`MigratorConfig.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, or `.mts`)
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

    const knexMigratorFilePath = path.resolve(options.knexMigratorFilePath || process.cwd());
    let resolvedConfigPath;

    for (const filename of CONFIG_FILENAMES) {
        try {
            resolvedConfigPath = require.resolve(path.join(knexMigratorFilePath, filename));
            break;
        } catch (err) {
            // CASE: this candidate does not exist, try the next one.
            if (err.code === 'MODULE_NOT_FOUND') {
                continue;
            }

            throw new errors.KnexMigrateError({ err: err });
        }
    }

    if (!resolvedConfigPath) {
        throw new errors.KnexMigrateError({
            message:
                'Please provide a file named MigratorConfig.js, MigratorConfig.cjs, MigratorConfig.mjs, MigratorConfig.ts, MigratorConfig.cts, or MigratorConfig.mts in your project root.',
            help: 'Read through the README.md to see which values are expected.',
        });
    }

    if (
        TYPESCRIPT_EXTENSIONS.includes(path.extname(resolvedConfigPath)) &&
        !module.exports.supportsTypeScript()
    ) {
        throw new errors.KnexMigrateError({
            message: `Cannot load ${path.basename(resolvedConfigPath)}: TypeScript type stripping is disabled in this Node.js process (${process.version}).`,
            help: 'Remove `--no-experimental-strip-types` from the Node.js options, or convert the config to JavaScript.',
        });
    }

    try {
        return interopDefault(require(resolvedConfigPath));
    } catch (err) {
        throw new errors.KnexMigrateError({ err: err });
    }
};

const TYPESCRIPT_FILE = /\.([cm]?)ts$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/**
 * @description Reads a migration directory and pairs each migration's recorded name with the file to load.
 *
 * Migrations are tracked by file name, so a TypeScript migration is recorded under the name of its
 * compiled output (`.ts` as `.js`, `.mts` as `.mjs`, `.cts` as `.cjs`): the file a production build
 * ships. When both exist side by side, the compiled file is loaded. Type declaration files are skipped.
 *
 * @param absolutePath
 * @returns {Array<{name: string, file: string}>}
 */
function readMigrationFiles(absolutePath) {
    let files = [];

    try {
        files = fs.readdirSync(absolutePath);
    } catch {
        throw new errors.KnexMigrateError({
            code: 'MIGRATION_PATH',
            message: 'MigrationPath is wrong: ' + absolutePath,
        });
    }

    const migrations = new Map();

    for (const file of files) {
        // CASE: ignore dot files and type declarations
        if (file.match(/^\./) || DECLARATION_FILE.test(file)) {
            continue;
        }

        const isTypeScript = TYPESCRIPT_FILE.test(file);
        const name = isTypeScript ? file.replace(TYPESCRIPT_FILE, '.$1js') : file;

        // CASE: the compiled file wins over its TypeScript source
        if (isTypeScript && migrations.has(name)) {
            continue;
        }

        migrations.set(name, { name, file });
    }

    return [...migrations.values()];
}

/**
 * @description List all migration names from disk based on a path.
 *
 * @param absolutePath
 * @returns {Array}
 */
exports.listFiles = function listFiles(absolutePath) {
    const files = readMigrationFiles(absolutePath).map(({ name }) => name);

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
    const files = readMigrationFiles(absolutePath);
    const tasks = files.map(({ name, file }) => {
        const executeFn = interopDefault(require(path.join(absolutePath, file)));

        try {
            return {
                up: executeFn.up,
                down: executeFn.down,
                config: executeFn.config,
                name,
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

        const versionToAdd = coerceVersion(folderToAdd);

        toReturn.forEach((existingElement, _index) => {
            if (index !== null) {
                return;
            }

            const existingVersion = coerceVersion(existingElement);

            // CASE: folder to add is smaller, push before this element
            if (versionToAdd && existingVersion && semver.lt(versionToAdd, existingVersion)) {
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
        const localCLIPath = require.resolve('knex-migrator', {
            paths: [path.resolve(options.path)],
        });
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
    const greaterVersion = coerceVersion(options.greaterVersion);
    const smallerVersion = coerceVersion(options.smallerVersion);

    if (!greaterVersion || !smallerVersion) {
        return false;
    }

    return semver.gt(greaterVersion, smallerVersion);
};
