var _ = require('lodash');
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
        config = require(knexMigratorFilePath + '/.knex-migrator');
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            throw new errors.KnexMigrateError({
                message: 'Please provide a file named .knex-migrator in your root.'
            });
        }

        throw new errors.KnexMigrateError({err: err});
    }

    if (!config.database) {
        throw new Error('.knex-migrator needs to export a database config.');
    }

    if (!config.migrationPath) {
        throw new Error('.knex-migrator needs to export the location of your migration files.');
    }

    this.migrationPath = config.migrationPath;

    // @TODO: make test connection to database to ensure database credentials are OK
    this.dbConfig = config.database;
}

/**
 * knex-migrator init
 */
KnexMigrator.prototype.init = function init(options) {
    options = options || {};
    var self = this;

    this.connection = database.connect(this.dbConfig);

    return database.createDatabaseIfNotExist(this.dbConfig)
        .then(function () {
            return self.createTransaction(function executeTasks(transacting) {
                var initPath = utils.getPath({
                    type: 'init',
                    migrationPath: self.migrationPath
                });

                return self.migrateTo({
                    version: 'init',
                    transacting: transacting,
                    only: options.only,
                    skip: options.skip
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
            return new Promise(function (resolve, reject) {
                self.connection.destroy(function (err) {
                    if (err) {
                        return reject(err);
                    }

                    debug('Destroyed connection');
                    resolve();
                });
            });
        });
};

/**
 * knex-migrator migrate
 * knex-migrator migrate --version v1.1
 * knex-migrator migrate --version v1.1 --only 2
 * knex-migrator migrate --version v1.1 --skip 3
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
        hooks = {};

    if (onlyFile && !onlyVersion) {
        onlyFile = null;
    }

    if (onlyVersion) {
        debug('onlyVersion: ' + onlyVersion);
    }

    try {
        hooks = require(self.migrationPath + '/hooks');
    } catch (err) {
        debug('No hooks found, no problem.');
    }

    this.connection = database.connect(this.dbConfig);

    return self.createTransaction(function executeTasks(transacting) {
        var folders = utils.readFolders(self.migrationPath),
            operations = {},
            versionsToMigrate = [];

        _.each(folders, function (folder) {
            if (folder === 'init' || folder === 'hooks') {
                return;
            }

            if (onlyVersion && folder !== onlyVersion) {
                debug('Do not execute: ' + folder);
                return;
            }

            operations[folder] = transacting('migrations').where({
                version: folder
            }).catch(function onMigrationsLookupError(err) {
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
            .then(function fetchedMigrationsFromDatabase(result) {
                _.each(result, function (value, version) {
                    var actual = value.length,
                        expected = utils.readTasks(self.migrationPath + '/' + version).length;

                    debug('Version ' + version + ' expected: ' + expected);
                    debug('Version ' + version + ' actual: ' + actual);

                    if (expected !== actual) {
                        debug('Need to execute migrations for: ' + version);
                        versionsToMigrate.push(version);
                    }
                });
            })
            .then(function executeBeforeHook() {
                if (!versionsToMigrate.length) {
                    return;
                }

                if (hooks.before) {
                    debug('Before hook');
                    return hooks.before({
                        connection: transacting
                    });
                }
            })
            .then(function executeMigrations() {
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
            })
            .then(function executeAfterHook() {
                if (!versionsToMigrate.length) {
                    return;
                }

                if (hooks.after) {
                    debug('After hook');
                    return hooks.after({
                        connection: transacting
                    });
                }
            })
    }).catch(function (err) {
        debug('Rolling back: ' + err.message);
        return Promise.reject(err);
    }).finally(function () {
        debug('Destroy connection');
        return new Promise(function (resolve, reject) {
            self.connection.destroy(function (err) {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
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
        tasks = utils.readTasks(self.migrationPath + '/' + version);

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
                    connection: transacting
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
                    connection: transacting
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
        return new Promise(function (resolve, reject) {
            self.connection.destroy(function (err) {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
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
 * Gives you two informations:
 * 1. is your database initialised?
 * 2. does your database needs a migration?
 *
 * @TODO:
 *   - add (2)
 */
KnexMigrator.prototype.isDatabaseOK = function isDatabaseOK(options) {
    options = options || {};

    var transacting = options.transacting,
        self = this,
        dbInitTasksLength = utils.readTasks(this.migrationPath + '/init').length;

    if (!transacting) {
        this.connection = database.connect(this.dbConfig);
    }

    return (transacting || this.connection)('migrations')
        .then(function (migrations) {
            if (_.filter(migrations, {version: 'init'}).length === dbInitTasksLength) {
                return;
            }

            throw new errors.DatabaseIsNotOkError({
                message: 'Please run knex-migrator init',
                code: 'DB_NOT_INITIALISED'
            });
        })
        .catch(function (err) {
            if (err.errno === 1049) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'DATABASE_DOES_NOT_EXIST'
                });
            }

            if (err.errno === 1 || err.errno === 1146) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'MIGRATION_TABLE_IS_MISSING'
                });
            }

            throw new errors.KnexMigrateError({
                err: err
            });
        })
        .finally(function () {
            if (!self.connection) {
                return;
            }

            return new Promise(function (resolve, reject) {
                self.connection.destroy(function (err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                });
            });
        });
};

module.exports = KnexMigrator;
