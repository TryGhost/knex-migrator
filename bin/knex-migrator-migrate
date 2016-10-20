#!/usr/bin/env node

var KnexMigrator = require('../');
var program = require('commander');

/**
 * @TODO: remove coloured-log (it can't print errors...)
 */
var Log = require('coloured-log');
var log = new Log(Log.INFO);
var migrator;

program
    .option('--only')
    .parse(process.argv);

try {
    migrator = new KnexMigrator();
} catch (err) {
    log.error(err.message);
    process.exit();
}

return migrator.migrate({
    only: program.only
}).then(function () {
    log.info('Finished database migration!');
}).catch(function (err) {
    log.error(err.message);
});
