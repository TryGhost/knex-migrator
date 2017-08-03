'use strict';

var _ = require('lodash');
var path = require('path');
var Promise = require('bluebird');
var debug = require('debug')('knex-migrator:index');
var database = require('./database');
var utils = require('./utils');
var errors = require('./errors');
var logging = require('../logging');

function KnexMigrator(options) {
    options = options || {};

    var config,
        knexMigratorFilePath = options.knexMigratorFilePath || process.cwd();

    try {
        config = require(path.join(path.resolve(knexMigratorFilePath), '/MigratorConfig.js'));
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            throw new errors.KnexMigrateError({
                message: 'Please provide a file named MigratorConfig.js in your project root.',
                help: 'Read through the README.md to see which values are expected.'
            });
        }

        throw new errors.KnexMigrateError({err: err});
    }

    if (!config.database) {
        throw new Error('MigratorConfig.js needs to export a database config.');
    }

    if (!config.migrationPath) {
        throw new Error('MigratorConfig.js needs to export the location of your migration files.');
    }

    if (!config.currentVersion) {
        throw new Error('MigratorConfig.js needs to export the a current version.');
    }

    this.currentVersion = config.currentVersion;
    this.migrationPath = config.migrationPath;
    this.subfolder = config.subfolder || 'versions';

    // @TODO: make test connection to database to ensure database credentials are OK
    this.dbConfig = config.database;
}

/**
 * knex-migrator init
 */
KnexMigrator.prototype.init = function init(options) {
    options = options || {};

    var self = this,
        disableHooks = options.disableHooks,
        noScripts = options.noScripts,
        hooks = {};

    try {
        if (!disableHooks) {
            hooks = require(path.join(self.migrationPath, '/hooks/init'));
        }
    } catch (err) {
        debug('Hook Error: ' + err.message);
        debug('No hooks found, no problem.');
    }

    this.connection = database.connect(this.dbConfig);

    return database.createDatabaseIfNotExist(this.dbConfig)
        .then(function () {
            if (noScripts) {
                return;
            }

            return self.createTransaction(function executeTasks(transacting) {
                return new Promise(function (resolve, reject) {
                    if (hooks.before) {
                        debug('Before hook');
                        return hooks.before({
                            transacting: transacting
                        }).then(resolve).catch(reject);
                    }

                    resolve();
                }).then(function () {
                    return self.createMigrationsTable({
                        transacting: transacting
                    });
                }).then(function executeMigrate() {
                    return self.migrateTo({
                        version: 'init',
                        transacting: transacting,
                        only: options.only,
                        skip: options.skip
                    })
                }).then(function executeAfterHook() {
                    if (hooks.after) {
                        debug('After hook');
                        return hooks.after({
                            transacting: transacting
                        });
                    }
                });
            });
        })
        .then(function onInitSuccess() {
            debug('Init Success');
        })
        .catch(function onInitError(err) {
            debug('Rolling back: ' + err.message);
            return Promise.reject(err);
        })
        .finally(function () {
            debug('Destroy connection');
            return self.connection.destroy()
                .then(function () {
                    debug('Destroyed connection');
                });
        });
};

/**
 * knex-migrator migrate
 * knex-migrator migrate --v v1.1
 * knex-migrator migrate --v v1.1 --force
 * knex-migrator migrate --v v1.1 --only 2
 * knex-migrator migrate --v v1.1 --skip 3
 * knex-migrator migrate --init
 *
 * Not Allowed:
 * knex-migrator migrate --skip 3
 *
 * By default: migrate will auto detect
 *
 * @TODO:
 *   - create more functions :P
 */
KnexMigrator.prototype.migrate = function migrate(options) {
    options = options || {};
    var self = this,
        onlyVersion = options.version,
        onlyFile = options.only,
        force = options.force,
        init = options.init,
        hooks = {};

    if (onlyFile && !onlyVersion) {
        onlyFile = null;
    }

    if (onlyVersion) {
        debug('onlyVersion: ' + onlyVersion);
    }

    if (init) {
        return this.init()
            .then(function () {
                return self.migrate(_.omit(options, 'init'));
            });
    }

    try {
        hooks = require(path.join(self.migrationPath, '/hooks/migrate'));
    } catch (err) {
        debug('Hook Error: ' + err.message);
        debug('No hooks found, no problem.');
    }

    this.connection = database.connect(this.dbConfig);

    return self.createTransaction(function executeTasks(transacting) {
        var versionsToMigrate = [];

        return self.integrityCheck({
            transacting: transacting,
            force: force
        }).then(function (result) {
            _.each(result, function (value, version) {
                if (onlyVersion && version !== onlyVersion) {
                    debug('Do not execute: ' + version);
                    return;
                }
            });

            if (onlyVersion) {
                if (!_.find(result, function (obj, key) {
                        return key === onlyVersion;
                    })) {

                    logging.warn('Cannot find requested version: ' + onlyVersion);
                }
            }

            _.each(result, function (value, version) {
                if (value.expected !== value.actual) {
                    debug('Need to execute migrations for: ' + version);
                    versionsToMigrate.push(version);
                }
            });
        }).then(function executeBeforeHook() {
            if (!versionsToMigrate.length) {
                return;
            }

            if (hooks.before) {
                debug('Before hook');
                return hooks.before({
                    transacting: transacting
                });
            }
        }).then(function executeMigrations() {
            if (!versionsToMigrate.length) {
                return;
            }

            return Promise.each(versionsToMigrate, function (versionToMigrate) {
                return self.migrateTo({
                    version: versionToMigrate,
                    transacting: transacting,
                    only: onlyFile,
                    hooks: hooks
                });
            });
        }).then(function executeAfterHook() {
            if (!versionsToMigrate.length) {
                return;
            }

            if (hooks.after) {
                debug('After hook');
                return hooks.after({
                    transacting: transacting
                });
            }
        })
    }).catch(function (err) {
        debug('Rolling back: ' + err.message);
        return Promise.reject(err);
    }).finally(function () {
        debug('Destroy connection');
        return self.connection.destroy()
            .then(function () {
                debug('Destroyed connection');
            });
    });
};

/**
 * migrate to v1.1
 * migrate to init
 */
KnexMigrator.prototype.migrateTo = function migrateTo(options) {
    options = options || {};

    var self = this,
        version = options.version,
        transacting = options.transacting,
        hooks = options.hooks || {},
        only = options.only || null,
        skip = options.skip || null,
        subfolder = this.subfolder,
        skippedTasks = [],
        tasks = [];

    if (version !== 'init') {
        tasks = utils.readTasks(path.join(self.migrationPath, subfolder, version));
    } else {
        try {
            tasks = utils.readTasks(path.join(self.migrationPath, version));
        } catch (err) {
            if (err.code === 'MIGRATION_PATH') {
                tasks = [];
            } else {
                throw err;
            }
        }
    }

    if (only !== null) {
        debug('only: ' + only);
        tasks = [tasks[only - 1]];
    } else if (skip !== null) {
        debug('skip: ' + skip);
        tasks.splice(skip - 1, 1);
    }

    debug('Migrate: ' + version + ' with ' + tasks.length + ' tasks.');
    debug('Tasks: ' + JSON.stringify(tasks));

    return Promise.each(tasks, function executeTask(task) {
        return self.beforeEachTask({
            transacting: transacting,
            task: task.name,
            version: version
        }).then(function () {
            if (hooks.beforeEach) {
                return hooks.beforeEach({
                    transacting: transacting
                });
            }
        }).then(function () {
            debug('Running:' + task.name);

            return task.execute({
                transacting: transacting
            });
        }).then(function () {
            return self.afterEachTask({
                transacting: transacting,
                task: task.name,
                version: version
            });
        }).then(function () {
            if (hooks.afterEach) {
                return hooks.afterEach({
                    transacting: transacting
                });
            }
        }).catch(function (err) {
            if (err instanceof errors.MigrationExistsError) {
                debug('Skipping:' + task.name);
                skippedTasks.push(task.name);
                return Promise.resolve();
            }

            /**
             * When your database encoding is set to utf8mb4 and you set a field length > 191 characters,
             * MySQL will throw an error, BUT it won't roll back the changes, because ALTER/CREATE table commands are
             * implicit commands.
             *
             * https://bugs.mysql.com/bug.php?id=28727
             * https://github.com/TryGhost/knex-migrator/issues/51
             */
            if (err.code === 'ER_TOO_LONG_KEY') {
                var match = err.message.match(/`\w+`/g);
                var table = match[0];
                var field = match[2];

                throw new errors.MigrationScript({
                    message: 'Field length of %field% in %table% is too long!'.replace('%field%', field).replace('%table%', table),
                    context: 'This usually happens if your database encoding is utf8mb4.\n' +
                    'All unique fields and indexes must be lower than 191 characters.\n' +
                    'Please correct your field length and reset your database with knex-migrator reset.\n',
                    help: 'Read more here: https://github.com/TryGhost/knex-migrator/issues/51\n',
                    err: err
                });
            }

            throw new errors.MigrationScript({
                message: err.message,
                help: 'Error occurred while executing the following migration: ' + task.name,
                err: err
            });
        });
    }).then(function () {
        if (version !== 'init' || (version === 'init' && skippedTasks.length)) {
            return Promise.resolve();
        }

        let versionsToMigrateTo;

        // CASE: insert all migration files, otherwise you will run into problems
        // e.g. you are on 1.2, you initialise the database, but there is 1.3 migration script
        try {
            versionsToMigrateTo = utils.readFolders(path.join(self.migrationPath, self.subfolder)) || [];
        } catch(err) {
            // CASE: versions folder does not exists
            if (err.code === 'READ_FOLDERS') {
                return Promise.resolve();
            }

            throw err;
        }

        return Promise.each(versionsToMigrateTo, function (versionToMigrateTo) {
            let filesToMigrateTo = utils.readTasks(path.join(self.migrationPath, self.subfolder, versionToMigrateTo)) || [];

            return Promise.each(filesToMigrateTo, function (fileToMigrateTo) {
                return transacting('migrations')
                    .where('name', fileToMigrateTo.name)
                    .then(function (migrationExists) {
                        if (migrationExists.length) {
                            return Promise.resolve();
                        }

                        return transacting('migrations')
                            .insert({
                                name: fileToMigrateTo.name,
                                version: versionToMigrateTo,
                                currentVersion: self.currentVersion
                            });
                    });
            });
        });
    });
};

/**
 * will delete the target database
 *
 * @TODO:
 * - think about deleting only the tables
 * - move to database
 */
KnexMigrator.prototype.reset = function reset() {
    var self = this;

    this.connection = database.connect(this.dbConfig);

    return database.drop({
        connection: this.connection,
        dbConfig: this.dbConfig
    }).catch(function onRestError(err) {
        debug('Reset error: ' + err.message);
        return Promise.reject(err);
    }).finally(function () {
        debug('Destroy connection');
        return self.connection.destroy()
            .then(function () {
                debug('Destroyed connection');
            });
    });
};

KnexMigrator.prototype.createMigrationsTable = function createMigrationsTable(options) {
    options = options || {};

    var localDatabase = options.transacting,
        self = this;

    return (localDatabase || this.connection)('migrations')
        .catch(function (err) {
            // CASE: table does not exist
            if (err.errno === 1 || err.errno === 1146) {
                debug('Creating table: migrations');

                return (localDatabase || self.connection).schema.createTable('migrations', function (table) {
                    table.increments().primary();
                    table.string('name');
                    table.string('version');
                    table.string('currentVersion');
                });
            }

            throw err;
        });
};

KnexMigrator.prototype.beforeEachTask = function beforeEachTask(options) {
    options = options || {};

    var localDatabase = options.transacting,
        task = options.task,
        version = options.version,
        self = this;

    return (localDatabase || this.connection)('migrations')
        .then(function (migrations) {
            if (!migrations.length) {
                return;
            }

            if (_.find(migrations, {name: task, version: version})) {
                throw new errors.MigrationExistsError();
            }
        });
};

KnexMigrator.prototype.afterEachTask = function afterTask(options) {
    options = options || {};

    var localDatabase = options.transacting,
        task = options.task,
        version = options.version;

    return (localDatabase || this.connection)('migrations')
        .insert({
            name: task,
            version: version,
            currentVersion: this.currentVersion
        });
};

KnexMigrator.prototype.createTransaction = function createTransaction(callback) {
    return this.connection.transaction(callback);
};

/**
 * returns expected and actual database state
 * @TODO: refactor
 */
KnexMigrator.prototype.integrityCheck = function integrityCheck(options) {
    options = options || {};

    var self = this,
        subfolder = this.subfolder,
        force = options.force,
        connection = options.transacting || this.connection,
        folders = [],
        currentVersionInitTask,
        operations = {},
        toReturn = {},
        futureVersions = [];

    // CASE: we always fetch the init scripts and check them
    // 1. to be able to add more init scripts
    // 2. to check if migration scripts need's to be executed or not, see https://github.com/TryGhost/knex-migrator/issues/39
    folders.push('init');

    // CASE: no subfolder yet
    try {
        folders = folders.concat(utils.readFolders(path.join(self.migrationPath, subfolder)));
    } catch (err) {
        // ignore
    }

    _.each(folders, function (folder) {
        // CASE: versions/1.1-members or versions/2.0-payments
        if (folder !== 'init') {
            try {
                folder = folder.match(/([\d\.\_]+)/)[0];
            } catch (err) {
                logging.warn('Cannot parse folder name.');
                logging.warn('Ignore Folder: ' + folder);
                return;
            }
        }

        // CASE:
        // if your current version is 1.0 and you add migration scripts for the next version 1.1
        // we won't execute them until your current version changes to 1.1 or until you force KM to migrate to it
        if (self.currentVersion && !force) {
            if (utils.isGreaterThanVersion({smallerVersion: self.currentVersion, greaterVersion: folder})) {
                futureVersions.push(folder);
            }
        }

        operations[folder] = connection('migrations').where({
            version: folder
        }).catch(function onMigrationsLookupError(err) {
            // CASE: no database selected (database.connection.database="")
            if (err.errno === 1046) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please define a target database in your configuration.',
                    help: 'database: {\n\tconnection:\n\t\tdatabase:"database_name"\n\t}\n}\n',
                    code: 'DB_NOT_INITIALISED'
                });
            }

            // CASE: database does not exist
            if (err.errno === 1049) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'DB_NOT_INITIALISED'
                });
            }

            // CASE: migration table does not exist
            if (err.errno === 1 || err.errno === 1146) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'MIGRATION_TABLE_IS_MISSING'
                });
            }

            throw err;
        });
    });

    return Promise.props(operations)
        .then(function (result) {
            _.each(result, function (value, version) {
                var actual = value.length,
                    expected = actual;

                // CASE: remember the version the user has initialised the database
                if (version === 'init') {
                    currentVersionInitTask = value.length && value[0].currentVersion;
                }

                if (version !== 'init') {
                    if (utils.isGreaterThanVersion({smallerVersion: currentVersionInitTask, greaterVersion: version})) {
                        expected = utils.readTasks(path.join(self.migrationPath, subfolder, version)).length;
                    }
                }
                else {
                    expected = utils.readTasks(path.join(self.migrationPath, version)).length;
                }

                debug('Version ' + version + ' expected: ' + expected);
                debug('Version ' + version + ' actual: ' + actual);

                toReturn[version] = {
                    expected: expected,
                    actual: actual
                }
            });


            // CASE: ensure that either you have to run `migrate --force` or they ran already
            if (futureVersions.length) {
                _.each(futureVersions, function (futureVersion) {
                    if (toReturn[futureVersion].actual !== toReturn[futureVersion].expected) {
                        logging.warn('knex-migrator is skipping ' + futureVersion);
                        logging.warn('Current version in MigratorConfig.js is smaller then requested version, use --force to proceed!');
                        logging.warn('Please run `knex-migrator migrate --v ' + futureVersion + ' --force` to proceed!');
                        delete toReturn[futureVersion];
                    }
                });
            }

            return toReturn;
        });
};

/**
 * Gives you two informations:
 * 1. is your database initialised?
 * 2. does your database needs a migration?
 */
KnexMigrator.prototype.isDatabaseOK = function isDatabaseOK(options) {
    options = options || {};

    var transacting = options.transacting,
        self = this;

    if (!transacting) {
        this.connection = database.connect(this.dbConfig);
    }

    return this.integrityCheck({
        transacting: transacting
    }).then(function (result) {
        // CASE: if an init script was removed, the health check will be positive (see #48)
        if (result.init && result.init.expected > result.init.actual) {
            throw new errors.DatabaseIsNotOkError({
                message: 'Please run knex-migrator init',
                code: 'DB_NOT_INITIALISED'
            });
        }

        _.each(_.omit(result, 'init'), function (value) {
            if (value.expected !== value.actual) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Migrations are missing. Please run knex-migrator migrate.',
                    code: 'DB_NEEDS_MIGRATION'
                });
            }
        });
    }).finally(function () {
        if (!self.connection) {
            return;
        }

        debug('Destroy connection');
        return self.connection.destroy()
            .then(function () {
                debug('Destroyed connection');
            });
    });
};

module.exports = KnexMigrator;
