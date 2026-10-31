// Selects which knex major the test suite runs against.
//
// knex is a peer dependency, so the suite installs knex 3 as `knex` and knex 2
// as the `knex2` alias. Setting `KNEX_VERSION=2` redirects `knex` and `knex/*`
// requires to the alias. Lookups with explicit `paths` (project-local knex
// resolution) are left alone.
const Module = require('module');

const knexVersion = process.env.KNEX_VERSION || '3';

if (!['2', '3'].includes(knexVersion)) {
    throw new Error('Unsupported KNEX_VERSION: ' + knexVersion);
}

if (knexVersion === '2' && !Module._knexMigratorVersionHook) {
    const resolveFilename = Module._resolveFilename;

    Module._knexMigratorVersionHook = true;
    Module._resolveFilename = function (request, parent, isMain, options) {
        if ((request === 'knex' || request.startsWith('knex/')) && !(options && options.paths)) {
            request = 'knex2' + request.slice('knex'.length);
        }

        return resolveFilename.call(this, request, parent, isMain, options);
    };
}

module.exports = knexVersion;
