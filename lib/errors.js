const _ = require('lodash'),
    errors = require('ghost-ignition').errors,
    util = require('util');

function KnexMigrateError(options) {
    options = options || {};
    errors.IgnitionError.call(this, options);
}

// jscs:disable
const knexMigratorErrors = {
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
    MigrationScriptError: function MigrationScriptError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 300,
            errorType: 'MigrationScriptError'
        }, options));
    },
    RollbackError: function RollbackError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 400,
            errorType: 'RollbackError'
        }, options));
    },
    MigrationsAreLockedError: function MigrationsAreLockedError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 500,
            errorType: 'MigrationsAreLockedError'
        }, options));
    },
    LockError: function LockError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 500,
            errorType: 'LockError'
        }, options));
    },
    UnlockError: function UnlockError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 500,
            errorType: 'UnlockError'
        }, options));
    },
    DatabaseError: function DatabaseError(options) {
        KnexMigrateError.call(this, _.merge({
            id: 500,
            errorType: 'DatabaseError'
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
