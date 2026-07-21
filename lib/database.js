const path = require('path'),
    bundledKnex = require('knex'),
    omit = require('lodash/omit'),
    debug = require('debug')('knex-migrator:database'),
    errors = require('./errors');
const DatabaseInfo = require('@tryghost/database-info');
const { sequence } = require('@tryghost/promise');

function destroyConnection(connection) {
    return new Promise(function (resolve, reject) {
        connection.destroy(function (err) {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

function loadKnex(options) {
    options = options || {};

    if (options.knexModulePath) {
        let resolvedKnexPath;

        try {
            resolvedKnexPath = require.resolve('knex', {
                paths: [path.resolve(options.knexModulePath)],
            });
        } catch (err) {
            if (err.code !== 'MODULE_NOT_FOUND') {
                throw err;
            }

            debug(
                'Could not load project knex from ' + options.knexModulePath + ': ' + err.message,
            );
        }

        if (resolvedKnexPath) {
            return require(resolvedKnexPath);
        }
    }

    return bundledKnex;
}

/**
 * @NOTE: Knex-migrator only supports knex query builder.
 *
 * @param options
 * @returns {Knex.QueryBuilder | Knex}
 */
exports.connect = function connect(options, connectionOptions) {
    options = options || {};

    // Alias `mysql` to `mysql2` so we can maintain backwards compatibility
    if (options.client === 'mysql') {
        options.client = 'mysql2';
    }

    // Alias `sqlite3` to `better-sqlite3` so we can maintain backwards compatibility
    if (options.client === 'sqlite3') {
        options.client = 'better-sqlite3';
    }

    const client = options.client;

    if (client === 'better-sqlite3') {
        options.useNullAsDefault = options.useNullAsDefault || false;
    }

    if (client === 'mysql2') {
        options.connection.timezone = options.connection.timezone || 'Z';
        options.connection.charset = options.connection.charset || 'utf8mb4';
        options.connection.decimalNumbers = true;

        delete options.connection.filename;
    }

    return loadKnex(connectionOptions)(options);
};

/**
 * If you instantiate knex, you won't know if the connection works.
 * This helper functions is used to test the connection. It's basically a "test query".
 *
 * @param connection
 * @returns {Promise<R> | Promise<any> | Promise<T>}
 */
exports.ensureConnectionWorks = async function ensureConnectionWorks(connection) {
    try {
        await connection.raw('SELECT 1+1 as RESULT;');
    } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'EAI_AGAIN') {
            throw new errors.DatabaseError({
                message: 'Invalid database host.',
                help: 'Please double check your database config.',
                err: err,
            });
        }

        throw new errors.DatabaseError({
            message: err.message,
            help: 'Unknown database error',
            err: err,
        });
    }
};

/**
 * @description Helper to create a transaction.
 * @param callback
 * @returns {*}
 */
module.exports.createTransaction = function (connection, callback) {
    return connection.transaction(callback);
};

/**
 * @description Whether the given knex connection talks to MySQL/MariaDB.
 *
 * Guarded so it can be called with the bare stub objects used in unit tests
 * (and any not-yet-connected knex instance) without throwing.
 *
 * @param {import('knex').Knex} connection
 * @returns {boolean}
 */
exports.isMySQL = function isMySQL(connection) {
    try {
        return DatabaseInfo.isMySQL(connection);
    } catch {
        return false;
    }
};

/**
 * @description Acquire a dedicated connection from the pool, bypassing the
 * regular query path.
 *
 * Used to hold a session-scoped MySQL advisory lock (`GET_LOCK`) for the
 * lifetime of a migration: the lock only stays held while *this* connection is
 * open, so it is released automatically if the process dies. The caller MUST
 * hand the connection back via {@link releaseRawConnection}.
 *
 * @param {import('knex').Knex} connection
 * @returns {Promise<any>} the raw driver connection
 */
exports.acquireRawConnection = function acquireRawConnection(connection) {
    return connection.client.acquireConnection();
};

/**
 * @description Return a raw connection acquired via {@link acquireRawConnection}
 * back to the pool.
 *
 * @param {import('knex').Knex} connection
 * @param {any} rawConnection
 * @returns {Promise<void>}
 */
exports.releaseRawConnection = function releaseRawConnection(connection, rawConnection) {
    return connection.client.releaseConnection(rawConnection);
};

/**
 * @description Run a query on a raw (pool-bypassing) driver connection.
 *
 * Kept deliberately small so that advisory-lock SQL (`GET_LOCK`/`RELEASE_LOCK`)
 * runs on the exact same session that must own the lock.
 *
 * @param {any} rawConnection - a mysql2 driver connection
 * @param {string} sql
 * @param {Array} [bindings]
 * @returns {Promise<any>}
 */
exports.rawQuery = function rawQuery(rawConnection, sql, bindings) {
    return new Promise(function (resolve, reject) {
        rawConnection.query(sql, bindings || [], function (err, rows) {
            if (err) {
                reject(err);
                return;
            }

            resolve(rows);
        });
    });
};

/**
 * @description Helper to create the migration table.
 *
 * @TODO: https://github.com/TryGhost/knex-migrator/issues/118
 * @TODO: https://github.com/TryGhost/knex-migrator/issues/91
 * @returns {Promise<R> | Promise<any> | * | Promise<T>}
 */
exports.createMigrationsTable = async function createMigrationsTable(connection) {
    const hasTable = await connection.schema.hasTable('migrations');
    if (hasTable) {
        return;
    }

    // CASE: table does not exist
    debug('Creating table: migrations');

    await connection.schema.createTable('migrations', function (table) {
        table.increments().primary();
        table.string('name');
        table.string('version');
        table.string('currentVersion');
    });
};

/**
 * Knex-migrator has an inbuilt feature to create a database if it does not exist yet.
 *
 * @param dbConfig
 * @returns {*}
 */
exports.createDatabaseIfNotExist = async function createDatabaseIfNotExist(
    dbConfig,
    connectionOptions,
) {
    const name = dbConfig.connection.database;
    const charset = dbConfig.connection.charset || 'utf8mb4';

    // @NOTE: Skip, because sqlite3 is a file based database.
    if (DatabaseInfo.isSQLiteConfig(dbConfig)) {
        return;
    }

    if (!DatabaseInfo.isMySQLConfig(dbConfig)) {
        throw new errors.KnexMigrateError({
            message: 'Database is not supported.',
        });
    }

    const connection = exports.connect(
        {
            client: dbConfig.client,
            connection: omit(dbConfig.connection, ['database']),
        },
        connectionOptions,
    );

    debug('Create database', name);

    try {
        await exports.ensureConnectionWorks(connection);
        await connection.raw('CREATE DATABASE `' + name + '` CHARACTER SET ' + charset + ';');
    } catch (err) {
        // CASE: DB exists
        if (err.errno === 1007) {
            return;
        }

        throw new errors.DatabaseError({
            message: err.message,
            err: err,
            code: 'DATABASE_CREATION_FAILED',
        });
    } finally {
        await destroyConnection(connection);
        debug('Destroy connection');
    }
};

/**
 * Drops a database. Is called when you call `knex-migrator reset`.
 *
 * @param options
 * @returns {*}
 */
exports.drop = async function drop(options) {
    options = options || {};

    const connection = options.connection;
    const dbConfig = options.dbConfig;

    if (DatabaseInfo.isMySQL(connection)) {
        debug('Drop database: ' + dbConfig.connection.database);

        try {
            await connection.raw('DROP DATABASE `' + dbConfig.connection.database + '`;');
        } catch (err) {
            // CASE: database does not exist, skip
            if (err.errno === 1049) {
                return;
            }

            throw new errors.KnexMigrateError({
                err: err,
            });
        }

        return;
    }

    if (DatabaseInfo.isSQLite(connection)) {
        // @NOTE: SQLite does not support "DROP DATABASE". We have to drop each table instead.
        // @NOTE: We cannot just remove the database file, because any database connection will get invalid.
        // @NOTE: better-sqlite3 (which `sqlite3` is aliased to) enforces foreign key constraints, so
        // dropping a parent table before its referencing children trips an FK error. Disable foreign
        // keys for the duration of the drop and restore afterwards. SQLite uses a single connection
        // here, so the PRAGMA persists across the drops.
        try {
            await connection.raw('PRAGMA foreign_keys = OFF;');

            const tables = await connection.raw(
                `SELECT name FROM sqlite_master WHERE type='table';`,
            );

            await sequence(
                tables.map((table) => async () => {
                    if (table.name === 'sqlite_sequence') {
                        debug('Skip drop table: ' + table.name);
                        return;
                    }

                    debug('Drop table: ' + table.name);
                    await connection.schema.dropTableIfExists(table.name);
                }),
            );
        } catch (err) {
            // CASE: database file was never initialised
            if (err.errno === 10) {
                return;
            }

            throw new errors.KnexMigrateError({
                err: err,
            });
        } finally {
            // Best-effort restore; never let a failed PRAGMA mask the drop result.
            await connection.raw('PRAGMA foreign_keys = ON;').catch(function () {});
        }

        return;
    }

    throw new errors.KnexMigrateError({
        message: 'Database client not supported: ' + dbConfig.client,
    });
};
