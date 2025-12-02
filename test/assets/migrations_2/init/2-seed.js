module.exports.up = function createTables(options) {
    return options.connection.raw(`INSERT INTO users (name) VALUES('Hausweib');`);
};

module.exports.up = function createTables(options) {
    return options.connection.raw(`DELETE FROM users where name='Hausweib';`);
};
