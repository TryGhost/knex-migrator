module.exports.up = function up(options) {
    return options.connection.raw('CREATE TABLE users (name VARCHAR(100));');
};
