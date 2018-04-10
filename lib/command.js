'use strict';

const program = require('commander');
const utils = require('./utils');
const logging = require('./logging');

module.exports = function command(configureFn, executeFn) {
    utils.getKnexMigrator({path: process.cwd()}).then((KnexMigrator) => {
        let knexMigrator;

        configureFn(program);

        program
            .option('--mgpath <path>')
            .parse(process.argv);

        try {
            knexMigrator = new KnexMigrator({knexMigratorFilePath: program.mgpath});
        } catch (err) {
            logging.error(err);
            process.exit(1);
        }

        return executeFn(knexMigrator, program);
    }).catch((err) => {
        logging.error(err.message);

        if (err.help) {
            logging.info(err.help);
        }

        process.exit(1);
    });
};
