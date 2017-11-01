module.exports.up = function update(options) {
    return options.connection.raw('UPDATE users set name="LULULU";');
};

module.exports.down = function createTables(options) {
    return options.connection.update('UPDATE users set name="Hausweib";');
};
