'use strict';

const _ = require('lodash'),
    path = require('path'),
    knex = require('knex'),
    sinon = require('sinon'),
    should = require('should'),
    fs = require('fs'),
    KnexMigrator = require('../lib'),
    config = require('../config'),
    errors = require('../lib/errors'),
    testUtils = require('./utils'),
    migratorConfigPath = path.join(__dirname, 'assets', 'migrations_1', 'MigratorConfig.js'),
    migrationPath = path.join(__dirname, 'assets', 'migrations_1');

let knexMigrator, connection;

describe('Implicit Commits', function () {
    describe('knex-migrator init', function () {
        before(function () {
            testUtils.writeMigratorConfig({
                migratorConfigPath: migratorConfigPath,
                migrationPath: migrationPath,
                currentVersion: '1.0'
            });

            knexMigrator = new KnexMigrator({
                knexMigratorFilePath: migrationPath
            });

            connection = testUtils.connect();

            return knexMigrator.reset();
        });

        after(function () {
           if (fs.existsSync(migratorConfigPath)) {
               fs.unlinkSync(migratorConfigPath);
           }
        });

        it.skip('expect full rollback', function () {
            return knexMigrator.init()
                .catch(function () {
                    return connection('users');
                })
                .then(function (values) {
                    values.length.should.eql(0);
                })
                .catch(function (err) {
                    // sqlite doesn't use autocommits inside an explicit transaction
                    err.errno.should.eql(1);
                });
        });
    });
});
