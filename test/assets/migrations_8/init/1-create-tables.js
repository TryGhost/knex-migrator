module.exports.up = function createTables(options) {
    return options.connection.raw('CREATE TABLE users (name VARCHAR(100));');
};

module.exports.down = function rollback(options) {
    return options.connection.raw('DROP TABLE users;');
};
