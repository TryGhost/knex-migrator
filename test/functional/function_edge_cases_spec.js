const _ = require('lodash'),
    path = require('path'),
    sinon = require('sinon'),
    should = require('should'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    config = require('../../config'),
    errors = require('../../lib/errors'),
    testUtils = require('../utils');

describe('Functional flow: Edge Cases', function () {
    this.timeout(1000 * 10);

    let knexMigrator,
        basePath = path.join(__dirname, '..', 'assets', 'migrations'),
        migrationPath = basePath,
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        connection;

    before(function () {
        testUtils.writeMigratorConfig({
            migratorConfigPath: migratorConfigPath,
            migrationPath: migrationPath,
            currentVersion: '1.0'
        });

        knexMigrator = new KnexMigrator({
            knexMigratorFilePath: path.join(__dirname, '..', 'assets')
        });
    });

    before(function () {
        return knexMigrator.reset({force: true});
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

    it('run init, but process gets destroyed', function () {
        return knexMigrator.init()
            .then(function () {
                return connection('migrations');
            })
            .then((response) => {
                response.length.should.eql(3);

                return connection('migrations').where('name', '1-another.js').delete();
            })
            .then(function () {
                return connection('migrations');
            })
            .then(function (response) {
                response.length.should.eql(2);

                return connection('migrations').where('name', '2-seed.js').delete();
            })
            .then(function () {
                return connection('migrations');
            })
            .then(function (response) {
                response.length.should.eql(1);
                return knexMigrator.init();
            })
            .then(() => {
                return connection('migrations');
            })
            .then(function (response) {
                response.length.should.eql(3);
            });
    });
});
