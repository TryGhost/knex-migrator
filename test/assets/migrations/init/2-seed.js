module.exports.up = function insert(options) {
    return options.connection.raw(`INSERT INTO users (name) VALUES('Hausweib');`);
};

module.exports.down = function insert(options) {
    return options.connection.raw(`DELETE FROM users where name='Hausweib';`);
};
