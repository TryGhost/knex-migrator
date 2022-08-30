const _ = require('lodash'),
    path = require('path'),
    sinon = require('sinon'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

describe('knex-migrator rollback (on init, auto-rollback)', function () {
    this.timeout(1000 * 10);

    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_7'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        connection;

    before(function () {
        testUtils.writeMigratorConfig({
            migratorConfigPath: migratorConfigPath,
            migrationPath: migrationPath,
            currentVersion: '1.20'
        });

        knexMigrator = new KnexMigrator({
            knexMigratorFilePath: path.join(__dirname, '..', 'assets')
        });
    });

    before(function () {
        return knexMigrator.reset();
    });

    before(function () {
        connection = testUtils.connect();
    });

    after(function (done) {
        connection && connection.destroy(done);

        if (fs.existsSync(migratorConfigPath)) {
            fs.unlinkSync(migratorConfigPath);

            _.each(require.cache, function (value, key) {
                if (key.match(/assets\/MigratorConfig\.js/)) {
                    delete require.cache[key];
                }
            });
        }
    });

    beforeEach(function () {
        sinon.spy(knexMigrator, '_beforeEach');
        sinon.spy(knexMigrator, '_afterEach');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('knex-migrator init', function () {
        return knexMigrator.init()
            .then(function () {
                'Should fail'.should.eql(false);
            })
            .catch(function (err) {
                err.help.should.eql('Error occurred while executing the following migration: 2-seed.js');
            });
    });

    it('knex-migrator health', function () {
        return knexMigrator.isDatabaseOK()
            .then(function () {
                'Should fail'.should.eql(false);
            })
            .catch(function (err) {
                err.message.should.eql('Please run `yarn knex-migrator init`');
            });
    });

    it('db check', function () {
        return connection('migrations')
            .then(function (migrations) {
                migrations.length.should.eql(0);
            });
    });
});
