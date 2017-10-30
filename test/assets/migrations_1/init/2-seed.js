module.exports = function createTables(options) {
    return options.transacting.raw('INSERT INTO users (name) VALUES("Hausweib");');
};
