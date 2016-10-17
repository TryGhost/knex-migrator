var database = require('../lib/database'),
    fs = require('fs');

describe('Database', function () {
    var databaseFile = __dirname + '/knex-migrator-test.db',
        connection1, connection2,
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
        var connection2 = database.connect(dbConfig);

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
});