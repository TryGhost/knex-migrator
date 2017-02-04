var knex = require('knex'),
    Promise = require('bluebird'),
    debug = require('debug')('knex-migrator:database'),
    fs = require('fs'),
    deleteFile = Promise.promisify(fs.unlink),
    errors = require('./errors');

/**
 * we only support knex
 */
exports.connect = function connect(options) {
    options = options || {};
    var client = options.client;

    if (client === 'sqlite3') {
        options.useNullAsDefault = options.useNullAsDefault || false;
    }

    if (client === 'mysql') {
        options.connection.timezone = options.connection.timezone || 'UTC';
        options.connection.charset = options.connection.charset || 'utf8mb4';
    }

    return knex(options);
};

exports.createDatabaseIfNotExist = function createDatabaseIfNotExist(dbConfig) {
    var name = dbConfig.connection.database,
        charset = dbConfig.connection.charset || 'utf8mb4';

    if (dbConfig.client === 'sqlite3') {
        return Promise.resolve();
    } else if (dbConfig.client !== 'mysql') {
        return Promise.reject(new errors.KnexMigrateError({
            message: 'Database is not supported.'
        }));
    }

    // only connect to mysql
    // connect without database selected
    var connection = exports.connect({
        client: dbConfig.client,
        connection: {
            host: dbConfig.connection.host,
            port: dbConfig.connection.port,
            user: dbConfig.connection.user,
            password: dbConfig.connection.password
        }
    });

    return connection.raw('CREATE DATABASE `' + name + '` CHARACTER SET ' + charset + ';')
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
            return new Promise(function (resolve, reject) {
                connection.destroy(function (err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                })
            });
        });
};

/**
 * sqlite3:
 * We can't delete the db file.
 * Any existing database connection to this file will be invalid.
 */
exports.drop = function drop(options) {
    options = options || {};

    var connection = options.connection,
        dbConfig = options.dbConfig;

    if (dbConfig.client === 'mysql') {
        debug('Drop database: ' + dbConfig.connection.database);
        return connection.raw('DROP DATABASE `' + dbConfig.connection.database + '`;')
            .catch(function (err) {
                // CASE: database does not exist, skip
                if (err.errno === 1049) {
                    return Promise.resolve();
                }

                return Promise.reject(new errors.KnexMigrateError({
                    err: err
                }));
            });
    }
    else if (dbConfig.client === 'sqlite3') {
        return connection.raw('SELECT name FROM sqlite_master WHERE type="table";')
            .then(function (tables) {
                return Promise.each(tables, function (table) {
                    if (table.name === 'sqlite_sequence') {
                        debug('Skip drop table: ' + table.name);
                        return Promise.resolve();
                    }

                    debug('Drop table: ' + table.name);
                    return connection.schema.dropTableIfExists(table.name);
                });
            })
            .catch(function (err) {
                // CASE: database file was never initialised
                if (err.errno === 10) {
                    return Promise.resolve();
                }

                return Promise.reject(new errors.KnexMigrateError({
                    err: err
                }));
            });
    }
    else {
        return Promise.reject(new errors.KnexMigrateError({
            message: 'Database client not supported: ' + dbConfig.client
        }));
    }
};
