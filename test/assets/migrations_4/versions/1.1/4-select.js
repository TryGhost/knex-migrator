module.exports.config = {
    transaction: true
};

module.exports.up = function doesNothing(options) {
    return options.transacting.raw('SELECT * FROM users;')
        .then(function () {
            return options.transacting.raw('SELECT * FROM users;');
        });
};
