var _ = require('lodash'),
    errors = require('ghost-ignition').errors,
    util = require('util');

function KnexMigrateError(options) {
    options = options || {};
    errors.IgnitionError.call(this, options);
}

// jscs:disable
var knexMigratorErrors = {
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
    },
    MigrationScript: function MigrationScript(options) {
        KnexMigrateError.call(this, _.merge({
            id: 300,
            errorType: 'MigrationScript'
        }, options));
    }
};

util.inherits(KnexMigrateError, errors.IgnitionError);
_.each(knexMigratorErrors, function (error) {
    util.inherits(error, KnexMigrateError);
});

// we need to inherit all general errors from GhostError, otherwise we have to check instanceof IgnitionError
_.each(errors, function (error) {
    if (error.name === 'IgnitionError' || typeof error === 'object') {
        return;
    }

    util.inherits(error, KnexMigrateError);
});

module.exports = _.merge(knexMigratorErrors, errors);
module.exports.KnexMigrateError = KnexMigrateError;
