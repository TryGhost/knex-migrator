var _ = require('lodash');
var Promise = require('bluebird');
var debug = require('debug')('knex-migrator');
var database = require('./database');
var utils = require('./utils');
var errors = require('./errors');

function KnexMigrator() {
    var config;

    try {
        config = require(process.cwd() + '/.knex-migrator');
    } catch (err) {
        throw new Error('Please provide a file named .knex-migrator in your root.');
    }

    if (!config.database) {
        throw new Error('.knex-migrator needs to export a database config.');
    }

    if (!config.migrationPath) {
        throw new Error('.knex-migrator needs to export the location of your migration files.');
    }

    this.migrationPath = config.migrationPath;
    this.connection = database.connect(config.database);
}

KnexMigrator.prototype.init = function init(options) {
    options = options || {};
    var self = this;

    return this.createTransaction(function executeTasks(transacting) {
        var initPath = utils.getPath({
                type: 'init',
                migrationPath: self.migrationPath
            }),
            dbInitTasks = utils.readTasks(initPath),
            skip = options.skip || null,
            only = options.only || null;

        if (only !== null) {
            dbInitTasks = [dbInitTasks[only - 1]];
        } else if (skip !== null) {
            dbInitTasks.splice(skip - 1, 1);
        }

        return Promise.each(dbInitTasks, function executeInitTask(task) {
            return self.beforeTask({
                transacting: transacting,
                task: task.name,
                type: 'init'
            }).then(function () {
                debug('Running:' + task.name);

                return task.execute({
                    transacting: transacting
                });
            }).then(function () {
                return self.afterTask({
                    transacting: transacting,
                    task: task.name,
                    type: 'init'
                });
            }).catch(function (err) {
                if (err instanceof errors.MigrationExistsError) {
                    debug('Skipping:' + task.name);
                    return Promise.resolve();
                }

                throw err;
            });
        });
    }).catch(function (err) {
        debug(err);
        return Promise.reject(err);
    });
};

KnexMigrator.prototype.beforeTask = function beforeTask(options) {
    options = options || {};

    var localDatabase = options.transacting,
        task = options.task,
        type = options.type,
        self = this;

    return (localDatabase || this.connection)('migrations')
        .then(function (migrations) {
            if (!migrations.length) {
                return;
            }

            if (_.find(migrations, {name: task, type: type})) {
                throw new errors.MigrationExistsError();
            }
        })
        .catch(function (err) {
            // CASE: table does not exist
            if (err.errno === 1 || err.errno === 1146) {
                debug('Creating table: migrations');

                return (localDatabase || self.connection).schema.createTable('migrations', function (table) {
                    table.string('name');
                    table.string('type');
                });
            }

            throw err;
        });
};

KnexMigrator.prototype.afterTask = function afterTask(options) {
    options = options || {};

    var localDatabase = options.transacting,
        task = options.task,
        type = options.type;

    return (localDatabase || this.connection)('migrations')
        .insert({
            name: task,
            type: type
        });
};

KnexMigrator.prototype.createTransaction = function createTransaction(callback) {
    return this.connection.transaction(callback);
};

KnexMigrator.prototype.isDatabaseOK = function isDatabaseOK(options) {
    options = options || {};

    var transacting = options.transacting,
        initPath = utils.getPath({
            type: 'init',
            migrationPath: this.migrationPath
        }),
        dbInitTasksLength = utils.readTasks(initPath).length;

    return (transacting || this.connection)('migrations')
        .then(function (migrations) {
            if (_.filter(migrations, {type: 'init'}).length === dbInitTasksLength) {
                return;
            }

            throw new errors.DatabaseIsNotOkError({
                message: 'Please run knex-migrator init',
                code: 'DB_NOT_INITIALISED'
            });
        })
        .catch(function (err) {
            if (err.errno === 1 || err.errno === 1146) {
                throw new errors.DatabaseIsNotOkError({
                    message: 'Please run knex-migrator init',
                    code: 'MIGRATION_TABLE_IS_MISSING'
                });
            }

            throw new errors.KnexMigrateError({
                err: err
            });
        });
};

module.exports = KnexMigrator;