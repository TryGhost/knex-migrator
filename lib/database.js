var knex = require('knex'),
    errors = require('./errors');

/**
 * we only support knex
 *
 * @TODO:
 * - encoding is hardcoded
 * - timezone is hardcoded
 */
exports.connect = function connect(options) {
    options = options || {};
    var client = options.client;

    if (client === 'sqlite3') {
        options.useNullAsDefault = options.useNullAsDefault || false;
    }

    if (client === 'mysql') {
        options.connection.timezone = 'UTC';
        options.connection.charset = 'utf8mb4';
    }

    return knex(options);
};

exports.createDatabaseIfNotExist = function createDatabaseIfNotExist(dbConfig) {
    var name = dbConfig.connection.database,
        charset = dbConfig.connection.charset || 'utf8mb4';

    // connect without database selected
    var temporaryConnection = exports.connect({
        client: dbConfig.client,
        connection: {
            host: dbConfig.connection.host,
            user: dbConfig.connection.user,
            password: dbConfig.connection.password
        }
    });

    if (dbConfig.client === 'sqlite3') {
        return Promise.resolve();
    } else if (dbConfig.client === 'mysql') {
        return temporaryConnection.raw('CREATE DATABASE ' + name + ' CHARACTER SET ' + charset + ';')
            .catch(function (err) {
                // CASE: DB exists
                if (err.errno === 1007) {
                    return Promise.resolve();
                }

                throw new errors.KnexMigrateError({
                    err: err,
                    code: 'DATABASE_CREATION_FAILED'
                });
            })
            .finally(function () {
                temporaryConnection.destroy();
            });
    } else {
        throw new errors.KnexMigrateError({
            message: 'Database is not supported.'
        });
    }
};
