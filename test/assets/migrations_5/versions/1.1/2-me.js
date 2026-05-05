module.exports.up = function doesNothing(options) {
    return options.connection.raw(`INSERT INTO users (name, country) VALUES('Fun', 'France');`);
};
