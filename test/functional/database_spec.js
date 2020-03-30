const database = require('../../lib/database'),
    errors = require('../../lib/errors'),
    fs = require('fs');

describe('Database', function () {
    let databaseFile = __dirname + '/knex-migrator-test.db',
        connection1,
        dbConfig = {
            client: 'sqlite3',
            connection: {
                filename: databaseFile
            }
        };

    beforeEach(function (done) {
        this.timeout(10 * 1000);
        connection1 = database.connect(dbConfig);

        connection1.raw('CREATE TABLE test (a Int);')
            .then(function () {
                done();
            })
            .catch(done);
    });

    afterEach(function () {
        if (!fs.existsSync(databaseFile)) {
            return;
        }

        fs.unlinkSync(databaseFile);
    });

    it('kill connection2 does not kill connection 1', function (done) {
        const connection2 = database.connect(dbConfig);

        connection1.destroy(function (err) {
            if (err) {
                return done(err);
            }

            connection2.raw('SELECT * from test;')
                .then(function () {
                    done();
                })
                .catch(done);
        });
    });

    it('ensure test connection works', function () {
        const connection2 = database.connect({
            client: 'mysql',
            connection: {
                host: 'unknown'
            }
        });

        return database.ensureConnectionWorks(connection2).then(() => {
            '1'.should.eql(1, 'Test should fail.');
        }).catch((err) => {
            (err instanceof errors.DatabaseError).should.be.true();
            err.message.should.eql('Invalid database host.');
        });
    });

    it('ensure test connection works', function () {
        const connection2 = database.connect({
            client: 'sqlite3',
            connection: {
                filename: databaseFile
            }
        });

        return database.ensureConnectionWorks(connection2);
    });
});
