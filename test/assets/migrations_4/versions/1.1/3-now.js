module.exports.up = function doesNothing(options) {
    return options.connection.raw('INSERT INTO users (name) VALUES("James");');
};

module.exports.down = function doesNothing(options) {
    return options.connection.raw('DELETE FROM users where name="James";');
};
