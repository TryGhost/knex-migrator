const _ = require('lodash'),
    path = require('path'),
    sinon = require('sinon'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

const sandbox = sinon.createSandbox();

describe('knex-migrator rollback (default)', function () {
    this.timeout(1000 * 10);

    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_6'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        versionsFolder = path.join(__dirname, '..', 'assets', 'migrations_6', 'versions'),
        migration121 = path.join(__dirname, '..', 'assets', 'migrations_6', 'versions', '1.21'),
        migration121File = path.join(__dirname, '..', 'assets', 'migrations_6', 'versions', '1.21', '1-test.js'),
        connection;

    before(function () {
        if (fs.existsSync(migration121File)) {
            fs.unlinkSync(migration121File);
        }

        if (fs.existsSync(migration121)) {
            fs.rmdirSync(migration121);
        }

        if (fs.existsSync(versionsFolder)) {
            fs.rmdirSync(versionsFolder);
        }

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

        if (fs.existsSync(migration121File)) {
            fs.unlinkSync(migration121File);
        }

        if (fs.existsSync(migration121)) {
            fs.rmdirSync(migration121);
        }

        if (fs.existsSync(versionsFolder)) {
            fs.rmdirSync(versionsFolder);
        }

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
        sandbox.spy(knexMigrator, 'beforeEach');
        sandbox.spy(knexMigrator, 'afterEach');
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('knex-migrator init', function () {
        return knexMigrator.init();
    });

    it('knex-migrator migrate', function () {
        fs.mkdirSync(versionsFolder);
        fs.mkdirSync(migration121);

        let jsFile = testUtils.generateMigrationScript({
            up: 'UPDATE users set name="Kind";',
            down: 'UPDATE users set name="Hausmann";'
        });

        fs.writeFileSync(migration121File, jsFile);
        knexMigrator.currentVersion = '1.21';
        return knexMigrator.migrate();
    });

    it('knex-migrator rollback', function () {
        return knexMigrator.rollback({force: true});
    });

    it('knex-migrator health', function () {
        return knexMigrator.isDatabaseOK()
            .then(function () {
                'Database should not be okay'.should.eql(false);
            })
            .catch(function (err) {
                err.message.should.eql('Migrations are missing. Please run `knex-migrator migrate`.');
            });
    });

    it('db check', function () {
        return connection('migrations')
            .then(function (migrations) {
                migrations.length.should.eql(2);
            });
    });

    it('knex-migrator rollback', function () {
        return knexMigrator.rollback({force: true})
            .then(function () {
                'No rollback expected.'.should.eql(false);
            })
            .catch(function (err) {
                err.message.should.eql('No migrations available to rollback.');
            })
    });
});
