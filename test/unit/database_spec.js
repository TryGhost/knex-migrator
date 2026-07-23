const should = require('should');
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');

const database = require('../../lib/database');
const errors = require('../../lib/errors');

describe('Database', function () {
    afterEach(function () {
        sinon.restore();
    });

    describe('connect', function () {
        it('aliases mysql configs to mysql2 defaults', function () {
            const connection = database.connect({
                client: 'mysql',
                connection: {
                    filename: 'unused.db',
                },
            });

            connection.client.config.client.should.eql('mysql2');
            connection.client.config.connection.timezone.should.eql('Z');
            connection.client.config.connection.charset.should.eql('utf8mb4');
            connection.client.config.connection.decimalNumbers.should.eql(true);
            should.not.exist(connection.client.config.connection.filename);

            return connection.destroy();
        });

        it('aliases sqlite3 configs to better-sqlite3', function () {
            const connection = database.connect({
                client: 'sqlite3',
                connection: {
                    filename: ':memory:',
                },
            });

            connection.client.config.client.should.eql('better-sqlite3');

            return connection.destroy();
        });

        it('preserves explicit sqlite useNullAsDefault', function () {
            const connection = database.connect({
                client: 'sqlite3',
                connection: {
                    filename: ':memory:',
                },
                useNullAsDefault: true,
            });

            connection.client.config.useNullAsDefault.should.eql(true);

            return connection.destroy();
        });

        it('prefers a project-local knex module when a project path is provided', function () {
            const projectPath = fs.mkdtempSync(
                path.join(os.tmpdir(), 'knex-migrator-project-knex-'),
            );
            const knexPath = path.join(projectPath, 'node_modules', 'knex');

            fs.mkdirSync(knexPath, { recursive: true });
            fs.writeFileSync(
                path.join(knexPath, 'index.js'),
                [
                    'module.exports = function knex(options) {',
                    '  return {',
                    '    client: {config: options},',
                    '    loadedFromProject: true',
                    '  };',
                    '};',
                    '',
                ].join('\n'),
            );

            try {
                const connection = database.connect(
                    {
                        client: 'sqlite3',
                        connection: {
                            filename: ':memory:',
                        },
                    },
                    {
                        knexModulePath: projectPath,
                    },
                );

                connection.loadedFromProject.should.eql(true);
                connection.client.config.client.should.eql('better-sqlite3');
            } finally {
                fs.rmSync(projectPath, { recursive: true, force: true });
            }
        });

        it('throws project-local knex load errors', function () {
            const projectPath = fs.mkdtempSync(
                path.join(os.tmpdir(), 'knex-migrator-broken-project-knex-'),
            );
            const knexPath = path.join(projectPath, 'node_modules', 'knex');

            fs.mkdirSync(knexPath, { recursive: true });
            fs.writeFileSync(
                path.join(knexPath, 'index.js'),
                'throw new Error("broken project knex");\n',
            );

            try {
                (function () {
                    database.connect(
                        {
                            client: 'sqlite3',
                            connection: {
                                filename: ':memory:',
                            },
                        },
                        {
                            knexModulePath: projectPath,
                        },
                    );
                }).should.throw('broken project knex');
            } finally {
                fs.rmSync(projectPath, { recursive: true, force: true });
            }
        });

        it('falls back to bundled knex when a project-local knex module is missing', function () {
            const projectPath = fs.mkdtempSync(
                path.join(os.tmpdir(), 'knex-migrator-missing-project-knex-'),
            );

            try {
                const connection = database.connect(
                    {
                        client: 'sqlite3',
                        connection: {
                            filename: ':memory:',
                        },
                        useNullAsDefault: true,
                    },
                    {
                        knexModulePath: projectPath,
                    },
                );

                connection.client.config.client.should.eql('better-sqlite3');
                return connection.destroy();
            } finally {
                fs.rmSync(projectPath, { recursive: true, force: true });
            }
        });
    });

    describe('ensureConnectionWorks', function () {
        it('wraps temporary DNS errors with database config help', function () {
            const err = new Error('temporary lookup failure');
            err.code = 'EAI_AGAIN';

            return database
                .ensureConnectionWorks({
                    raw: sinon.stub().rejects(err),
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (wrappedErr) {
                    wrappedErr.should.be.instanceof(errors.DatabaseError);
                    wrappedErr.message.should.eql('Invalid database host.');
                    wrappedErr.help.should.eql('Please double check your database config.');
                });
        });

        it('wraps unknown connection failures', function () {
            return database
                .ensureConnectionWorks({
                    raw: sinon.stub().rejects(new Error('permission denied')),
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (wrappedErr) {
                    wrappedErr.should.be.instanceof(errors.DatabaseError);
                    wrappedErr.message.should.eql('permission denied');
                    wrappedErr.help.should.eql('Unknown database error');
                });
        });
    });

    describe('createMigrationsTable', function () {
        it('does nothing when the migrations table already exists', function () {
            const createTable = sinon.stub();

            return database
                .createMigrationsTable({
                    schema: {
                        hasTable: sinon.stub().resolves(true),
                        createTable: createTable,
                    },
                })
                .then(function () {
                    createTable.called.should.eql(false);
                });
        });
    });

    describe('createDatabaseIfNotExist', function () {
        it('does nothing for sqlite configs', function () {
            return database.createDatabaseIfNotExist({
                client: 'sqlite3',
                connection: {
                    filename: ':memory:',
                },
            });
        });

        it('rejects unsupported database clients', function () {
            return database
                .createDatabaseIfNotExist({
                    client: 'postgres',
                    connection: {
                        database: 'km_testing',
                    },
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.KnexMigrateError);
                    err.message.should.eql('Database is not supported.');
                });
        });

        it('ignores existing mysql databases', function () {
            const connection = {
                raw: sinon.stub().rejects({ errno: 1007 }),
                destroy: sinon.stub().callsArg(0),
            };

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();

            return database
                .createDatabaseIfNotExist({
                    client: 'mysql2',
                    connection: {
                        database: 'km_testing',
                    },
                })
                .then(function () {
                    connection.destroy.calledOnce.should.eql(true);
                });
        });

        it('rejects destroy failures after mysql database creation', function () {
            const connection = {
                raw: sinon.stub().resolves(),
                destroy: sinon.stub().callsArgWith(0, new Error('destroy failed')),
            };

            sinon.stub(database, 'connect').returns(connection);
            sinon.stub(database, 'ensureConnectionWorks').resolves();

            return database
                .createDatabaseIfNotExist({
                    client: 'mysql2',
                    connection: {
                        database: 'km_testing',
                    },
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.message.should.eql('destroy failed');
                });
        });
    });

    describe('drop', function () {
        it('ignores missing mysql databases', function () {
            return database.drop({
                dbConfig: {
                    connection: {
                        database: 'km_testing',
                    },
                },
                connection: {
                    client: {
                        config: {
                            client: 'mysql2',
                        },
                    },
                    raw: sinon.stub().rejects({ errno: 1049 }),
                },
            });
        });

        it('wraps mysql drop failures', function () {
            return database
                .drop({
                    dbConfig: {
                        connection: {
                            database: 'km_testing',
                        },
                    },
                    connection: {
                        client: {
                            config: {
                                client: 'mysql2',
                            },
                        },
                        raw: sinon.stub().rejects(new Error('permission denied')),
                    },
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.KnexMigrateError);
                });
        });

        it('drops sqlite tables and skips sqlite_sequence', function () {
            const dropTableIfExists = sinon.stub().resolves();
            const connection = {
                client: {
                    config: {
                        client: 'sqlite3',
                    },
                },
                raw: sinon.stub().resolves([{ name: 'sqlite_sequence' }, { name: 'migrations' }]),
                schema: {
                    dropTableIfExists: dropTableIfExists,
                },
            };

            return database
                .drop({
                    dbConfig: {
                        client: 'sqlite3',
                    },
                    connection: connection,
                })
                .then(function () {
                    dropTableIfExists.calledOnceWith('migrations').should.eql(true);
                });
        });

        it('restores better-sqlite foreign keys after dropping tables', function () {
            const raw = sinon.stub();
            raw.onFirstCall().resolves();
            raw.onSecondCall().resolves([{ name: 'migrations' }]);
            raw.onThirdCall().resolves();

            const connection = {
                client: {
                    config: {
                        client: 'better-sqlite3',
                    },
                },
                raw: raw,
                schema: {
                    dropTableIfExists: sinon.stub().resolves(),
                },
            };

            return database
                .drop({
                    dbConfig: {
                        client: 'better-sqlite3',
                    },
                    connection: connection,
                })
                .then(function () {
                    raw.firstCall.calledWith('PRAGMA foreign_keys = OFF;').should.eql(true);
                    raw.thirdCall.calledWith('PRAGMA foreign_keys = ON;').should.eql(true);
                });
        });

        it('ignores uninitialized sqlite databases', function () {
            return database.drop({
                dbConfig: {
                    client: 'sqlite3',
                },
                connection: {
                    client: {
                        config: {
                            client: 'sqlite3',
                        },
                    },
                    raw: sinon.stub().rejects({ errno: 10 }),
                    schema: {
                        dropTableIfExists: sinon.stub(),
                    },
                },
            });
        });

        it('wraps sqlite drop failures', function () {
            return database
                .drop({
                    dbConfig: {
                        client: 'sqlite3',
                    },
                    connection: {
                        client: {
                            config: {
                                client: 'sqlite3',
                            },
                        },
                        raw: sinon.stub().rejects(new Error('drop failed')),
                        schema: {
                            dropTableIfExists: sinon.stub(),
                        },
                    },
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.KnexMigrateError);
                });
        });

        it('rejects unsupported database clients', function () {
            return database
                .drop({
                    dbConfig: {
                        client: 'postgres',
                    },
                    connection: {
                        client: {
                            config: {
                                client: 'postgres',
                            },
                        },
                    },
                })
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.KnexMigrateError);
                    err.message.should.eql('Database client not supported: postgres');
                });
        });
    });

    describe('isMySQL', function () {
        it('detects a mysql connection', function () {
            const connection = database.connect({
                client: 'mysql',
                connection: { filename: 'unused.db' },
            });

            database.isMySQL(connection).should.eql(true);

            return connection.destroy();
        });

        it('returns false for sqlite connections', function () {
            const connection = database.connect({
                client: 'sqlite3',
                connection: { filename: ':memory:' },
            });

            database.isMySQL(connection).should.eql(false);

            return connection.destroy();
        });

        it('returns false (does not throw) for bare stub objects', function () {
            database.isMySQL({}).should.eql(false);
        });
    });

    describe('rawQuery', function () {
        it('resolves the driver rows', function () {
            const rawConnection = {
                query: function (sql, bindings, cb) {
                    cb(null, [{ ok: 1 }]);
                },
            };

            return database.rawQuery(rawConnection, 'SELECT 1', []).then(function (rows) {
                rows.should.eql([{ ok: 1 }]);
            });
        });

        it('rejects on a driver error', function () {
            const boom = new Error('driver failed');
            const rawConnection = {
                query: function (sql, bindings, cb) {
                    cb(boom);
                },
            };

            return database
                .rawQuery(rawConnection, 'SELECT 1')
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.equal(boom);
                });
        });
    });
});
