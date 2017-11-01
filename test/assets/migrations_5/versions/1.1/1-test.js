module.exports.up = function createTables(options) {
    return options.connection.raw('ALTER TABLE users ADD country VARCHAR(100);');
};

module.exports.rollback = function (options) {
    return options.connection.raw('ALTER TABLE users DROP COLUMN country;');
};
