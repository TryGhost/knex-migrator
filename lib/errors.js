var _ = require('lodash'),
    util = require('util');

function KnexMigrateError(options) {
    options = options || {};
    var self = this;

    if (_.isString(options)) {
        throw new Error('Please instantiate Errors with the option pattern. e.g. new errors.KnexMigrateError({message: ...})');
    }

    Error.call(this);
    Error.captureStackTrace(this, KnexMigrateError);

    /**
     * defaults
     */
    this.statusCode = 500;
    this.errorType = this.name = 'KnexMigrateError';
    this.id = 0;

    /**
     * option overrides
     */
    this.id = options.id || this.id;
    this.message = options.message || this.message;
    this.help = options.help || this.help;
    this.code = options.code || this.code;
    this.errorType = this.name = options.errorType || this.errorType;

    // error to inherit from, override!
    if (options.err) {
        Object.getOwnPropertyNames(options.err).forEach(function (property) {
            self[property] = options.err[property] || self[property];
        });
    }
}

// jscs:disable
var errors = {
    MigrationExistsError: function MigrationExistsError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 100,
            errorType: 'MigrationExistsError'
        }, options));
    },
    DatabaseIsNotOkError: function DatabaseIsNotOkError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 200,
            errorType: 'DatabaseIsNotOkError',
            help: 'If knex-migrator is not installed, please run "npm install -g knex-migrator" \nRead more here: https://github.com/TryGhost/knex-migrator'
        }, options));
    }
};

_.each(errors, function (error) {
    util.inherits(error, KnexMigrateError);
});

module.exports = errors;
module.exports.KnexMigrateError = KnexMigrateError;
