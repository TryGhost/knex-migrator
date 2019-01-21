const _ = require('lodash'),
    path = require('path'),
    sinon = require('sinon'),
    should = require('should'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    KnexMigrator = require('../../lib'),
    testUtils = require('../utils');

describe('knex-migrator rollback (to specific version)', function () {
    this.timeout(1000 * 10);

    let knexMigrator,
        migrationPath = path.join(__dirname, '..', 'assets', 'migrations_6'),
        migratorConfigPath = path.join(__dirname, '..', 'assets', 'MigratorConfig.js'),
        versionsFolder = path.join(__dirname, '..', 'assets', 'migrations_6', 'versions'),
        migrations = [],
        connection;

    before(function () {
        if (fs.existsSync(versionsFolder)) {
            rimraf.sync(versionsFolder);
        }

        testUtils.writeMigratorConfig({
            migratorConfigPath: migratorConfigPath,
            migrationPath: migrationPath,
            currentVersion: '1.2'
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

        if (fs.existsSync(versionsFolder)) {
            rimraf.sync(versionsFolder);
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
        sinon.spy(knexMigrator, 'beforeEach');
        sinon.spy(knexMigrator, 'afterEach');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('knex-migrator init', function () {
        return knexMigrator.init()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                values.length.should.eql(2);
                values[0].currentVersion.should.eql('1.2');
                values[1].currentVersion.should.eql('1.2');
            });
    });

    it('add', function () {
        migrations.push({
            folder: versionsFolder + '/1.3',
            file: '1-test.js'
        }, {
            folder: versionsFolder + '/1.4',
            file: '1-test.js'
        }, {
            folder: versionsFolder + '/1.6',
            file: '1-test.js'
        }, {
            folder: versionsFolder + '/1.11',
            file: '1-test.js'
        }, {
            folder: versionsFolder + '/1.20',
            file: '1-test.js'
        });

        fs.mkdirSync(versionsFolder);
        migrations.forEach((migration) => {
            fs.mkdirSync(migration.folder);

            let jsFile = testUtils.generateMigrationScript({
                up: 'UPDATE users set name="Kind";',
                down: 'UPDATE users set name="Hausmann";'
            });

            fs.writeFileSync(migration.folder + '/' + migration.file, jsFile);
        });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.4';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator.migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                values.length.should.eql(4);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.5';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator.migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                values.length.should.eql(4);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.8';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator.migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                values.length.should.eql(5);
            });
    });

    it('change current version', function () {
        knexMigrator.currentVersion = '1.20';
    });

    it('knex-migrator migrate', function () {
        return knexMigrator.migrate()
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                values.length.should.eql(7);
            });
    });

    it('knex-migrator rollback', function () {
        return knexMigrator.rollback({force: true, version: '1.11.3'})
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                values.length.should.eql(6);
            });
    });

    it('knex-migrator health', function () {
        return knexMigrator.isDatabaseOK()
            .then(() => {
                '1'.should.eql(1);
            })
            .catch((err) => {
                should.exist(err);

                // current version is still 1.20 and you rolled back the migration scripts till 1.11
                err.code.should.eql('DB_NEEDS_MIGRATION');
            });
    });

    it('knex-migrator rollback', function () {
        return knexMigrator.rollback({force: true, version: '1.2'})
            .then(() => {
                return connection('migrations');
            })
            .then((values) => {
                // 2 init scripts
                values.length.should.eql(2);
            });
    });
});
