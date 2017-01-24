var _ = require('lodash');
var path = require('path');
var Promise = require('bluebird');
var debug = require('debug')('knex-migrator:index');
var database = require('./database');
var utils = require('./utils');
var errors = require('./errors');

function KnexMigrator(options) {
    options = options || {};

    var config,
        knexMigratorFilePath = options.knexMigratorFilePath || process.cwd();

    try {
        config = require(path.join(knexMigratorFilePath, '/MigratorConfig.js'));
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
            return self.createTransaction(function executeTasks(transacting) {
                return new Promise(function (resolve, reject) {
                    if (hooks.before) {
                        debug('Before hook');
                        return hooks.before({
                            transacting: transacting
                        }).then(resolve).catch(reject);
                    }

                    resolve();
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
 *
 * Not Allowed:
 * knex-migrator migrate --skip 3
 *
 * By default: migrate will auto detect
 *
 * @TODO:
 *   - create more functions
 */
KnexMigrator.prototype.migrate = function migrate(options) {
    options = options || {};
    var self = this,
        onlyVersion = options.version,
        onlyFile = options.only,
        force = options.force,
        hooks = {};

    if (onlyFile && !onlyVersion) {
        onlyFile = null;
    }

    if (onlyVersion) {
        debug('onlyVersion: ' + onlyVersion);
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
        tasks = [];

    if (version !== 'init') {
        tasks = utils.readTasks(path.join(self.migrationPath, subfolder, version));
    } else {
        tasks = utils.readTasks(path.join(self.migrationPath, version));
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
                return Promise.resolve();
            }

            throw err;
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
        })
        .catch(function (err) {
            // CASE: table does not exist
            if (err.errno === 1 || err.errno === 1146) {
                debug('Creating table: migrations');

                return (localDatabase || self.connection).schema.createTable('migrations', function (table) {
                    table.string('name');
                    table.string('version');
                });
            }

            throw err;
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
            version: version
        });
};

KnexMigrator.prototype.createTransaction = function createTransaction(callback) {
    return this.connection.transaction(callback);
};

/**
 * returns expected and actual database state
 */
KnexMigrator.prototype.integrityCheck = function integrityCheck(options) {
    options = options || {};

    var self = this,
        subfolder = this.subfolder,
        force = options.force,
        init = options.init,
        connection = options.transacting || this.connection,
        folders = utils.readFolders(path.join(self.migrationPath, subfolder)),
        operations = {},
        toReturn = {};

    if (init) {
        folders.push('init');
    }

    _.each(folders, function (folder) {
        // if you current version if 1.0 and you add migration scripts for the next version 1.1
        // we won't execute them until your current version changes to 1.1
        if (self.currentVersion && !force) {
            if (Number(folder) > Number(self.currentVersion)) {
                return;
            }
        }

        operations[folder] = connection('migrations').where({
            version: folder
        }).catch(function onMigrationsLookupError(err) {
            // CASE: database does not exist
            if (err.errno === 1049) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'MIGRATION_TABLE_IS_MISSING'
                });
            }

            // CASE: table does not exist
            if (err.errno === 1 || err.errno === 1146) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'DB_NOT_INITIALISED'
                });
            }

            throw err;
        });
    });

    return Promise.props(operations)
        .then(function (result) {
            _.each(result, function (value, version) {
                var actual = value.length,
                    expected = 0;

                if (version !== 'init') {
                    expected = utils.readTasks(path.join(self.migrationPath, subfolder, version)).length;
                } else {
                    expected = utils.readTasks(path.join(self.migrationPath, version)).length;
                }

                debug('Version ' + version + ' expected: ' + expected);
                debug('Version ' + version + ' actual: ' + actual);

                toReturn[version] = {
                    expected: expected,
                    actual: actual
                }
            });

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
        transacting: transacting,
        init: true
    }).then(function (result) {
        if (result.init && result.init.expected !== result.init.actual) {
            throw new errors.DatabaseIsNotOkError({
                message: 'Please run knex-migrator init',
                code: 'DB_NOT_INITIALISED'
            });
        }

        _.each(_.omit(result, 'init'), function (value) {
            if (value.expected !== value.actual) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator migrate',
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
