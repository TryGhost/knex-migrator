const debug = require('debug')('knex-migrator:field-length');

/**
 * @description Private helper to migrate the migrations table. It will add missing constraints to existing fields.
 * @returns {*}
 */
module.exports.up = async function up(connection) {
    debug('Ensure Field Length.');

    const exists = await connection.schema.hasTable('migrations');
    if (!exists) {
        return;
    }

    try {
        await connection.schema.alterTable('migrations', function (table) {
            table.string('name', 120).nullable(false).alter();
            table.string('version', 70).nullable(false).alter();
        });
    } catch {
        // ignore for now, it's not a urgent, required change
    }
};
