module.exports.up = function createTables() {
    throw new Error('failed');
};

module.exports.down = function createTables(options) {
    return options.connection.raw('DELETE FROM users where name="Hausweib";');
};
