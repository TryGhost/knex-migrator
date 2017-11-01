'use strict';

const Nconf = require('nconf'),
    path = require('path'),
    env = process.env.NODE_ENV || 'development';

let _private = {};

_private.loadNconf = function loadNconf() {
    let baseConfigPath = __dirname,
        customConfigPath = process.cwd(),
        nconf = new Nconf.Provider();

    /**
     * command line arguments
     */
    nconf.argv();

    /**
     * env arguments
     */
    nconf.env({
        separator: '__'
    });

    nconf.file('custom-env', path.join(customConfigPath, 'config.' + env + '.json'));
    nconf.file('default-env', path.join(baseConfigPath, 'env', 'config.' + env + '.json'));

    /**
     * values we have to set manual
     */
    nconf.set('env', env);

    return nconf;
};

module.exports = _private.loadNconf();
