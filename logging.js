var logging = require('ghost-ignition').logging;

module.exports = logging({
    env: process.env.NODE_ENV,
    mode: 'long',
    level: 'info',
    transports: ['stdout', 'stderr']
});