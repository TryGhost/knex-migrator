const debug = require('debug')('knex-migrator:lock-table');

/**
 * Checks if primary key index exists in a table over the given columns.
 */
function hasPrimaryKey(tableName, knex) {
    const client = knex.client.config.client;

    if (client === 'mysql') {
        const dbName = knex.client.config.connection.database;
        return knex.raw(`
                SELECT CONSTRAINT_NAME
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=:dbName
                AND TABLE_NAME=:tableName
                AND CONSTRAINT_TYPE='PRIMARY KEY'`, {dbName, tableName})
            .then(([rawConstraints]) => {
                return rawConstraints.length > 0;
            });
    } else {
        return knex.raw(`PRAGMA index_list('${tableName}');`)
            .then((rawConstraints) => {
                const tablePrimaryKey = rawConstraints.find(c => c.origin === 'pk');
                return tablePrimaryKey;
            });
    }
}

/**
 * Adds an primary key index to a table over the given columns.
 */
function addPrimaryKey(tableName, columns, knex) {
    return hasPrimaryKey(tableName, knex)
        .then((hasUniqueConstraint) => {
            if (!hasUniqueConstraint) {
                debug(`Adding primary key constraint for: ${columns} in table ${tableName}`);
                return knex.schema.table(tableName, function (table) {
                    table.primary(columns);
                });
            } else {
                debug(`Primary key constraint for: ${columns} already exists for table: ${tableName}`);
            }
        });
}

/**
 * @description Private helper to create add a primary key to the migration lock table. The helper is called as part of `runDatabaseUpgrades`.
 * @returns {*}
 */
module.exports.up = function (connection) {
    debug('Add primary key to the lock table.');

    return addPrimaryKey('migrations_lock', 'lock_key', connection);
};
