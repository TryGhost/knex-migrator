module.exports.up = function createTables(options) {
    return options.connection.raw('CREATE TABLE dogs (type VARCHAR(100));');
};

module.exports.rollback = function rollback(options) {
    return options.connection.raw('DROP TABLE dogs;');
};

module.exports.config = {
    ddl: true
};
