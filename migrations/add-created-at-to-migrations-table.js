const debug = require('debug')('knex-migrator:migration');

/**
 * @description Private helper to migrate the migrations table. It adds the created_at column to the migrations table.
 * @returns {*}
 */
module.exports.up = function (connection) {
    debug('Ensure created_at column.');

    return connection.schema.hasTable('migrations')
        .then(function (exists) {
            if (exists) {
                return connection.schema.alterTable('migrations', function (table) {
                    const now = this.client.raw('CURRENT_TIMESTAMP');
                    table.timestamp('created_at').notNullable().defaultTo(now);
                }).catch(function () {
                    // ignore for now, it's not a urgent, required change
                    return Promise.resolve();
                });
            }
        });
};
