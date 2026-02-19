module.exports.up = function doesSomething(options) {
    return options.connection.raw(`INSERT INTO dogs (type) VALUES('Zwergpudel');`);
};
