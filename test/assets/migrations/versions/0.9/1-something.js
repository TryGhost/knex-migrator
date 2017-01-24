module.exports = function createTables(options) {
    return options.transacting.raw('UPDATE users set name="LALALALA";');
};