const debug = require('debug')('knex-migrator:use-index');

/**
 * @description Private helper to migrate the migrations table. It will add missing indexes to existing fields.
 * @returns {*}
 */
module.exports.up = async function up(connection) {
    debug('Ensure Unique Index.');

    const exists = await connection.schema.hasTable('migrations');
    if (!exists) {
        return;
    }

    try {
        await connection.schema.alterTable('migrations', function (table) {
            table.unique(['name', 'version']);
        });
    } catch {
        // @NOTE: ignore for now, it's not a urgent, required change
        // e.g. index exists already (1061,1)
        // e.g. can't index because of already existing duplicates
    }
};
