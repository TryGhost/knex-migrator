module.exports.up = function createTables(options) {
    return options.connection.raw('INSERT INTO users (name) VALUES("Hausweib");');
};
