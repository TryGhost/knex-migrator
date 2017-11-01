/**
 * http://www.sqlite.org/lang_altertable.html
 */
module.exports.up = function createTables(options) {
    return options.connection.raw('ALTER TABLE users ADD country VARCHAR(100);');
};

module.exports.down = function rollback(options) {
    return options.connection.raw('ALTER TABLE users DROP COLUMN country;');
};
