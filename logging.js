var config = require('ghost-ignition').config();
var logging = require('ghost-ignition').logging;

module.exports = logging({
    env: config.get('env'),
    path: config.get('logging:path'),
    mode: config.get('logging:mode'),
    level: config.get('logging:level'),
    transports: config.get('logging:transports')
});