module.exports.up = function doesNothing(options) {
    return options.connection.raw('SELECT * FROM dogs;');
};
