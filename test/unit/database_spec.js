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

            expect(connection.client.config.client).toEqual('mysql2');
            expect(connection.client.config.connection.timezone).toEqual('Z');
            expect(connection.client.config.connection.charset).toEqual('utf8mb4');
            expect(connection.client.config.connection.decimalNumbers).toEqual(true);
            expect(connection.client.config.connection.filename).toBeOneOf([null, undefined]);

            return connection.destroy();
        });

        it('aliases sqlite3 configs to better-sqlite3', function () {
            const connection = database.connect({
                client: 'sqlite3',
                connection: {
                    filename: ':memory:',
                },
            });

            expect(connection.client.config.client).toEqual('better-sqlite3');

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

            expect(connection.client.config.useNullAsDefault).toEqual(true);

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

                expect(connection.loadedFromProject).toEqual(true);
                expect(connection.client.config.client).toEqual('better-sqlite3');
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
                expect(function () {
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
                }).toThrow('broken project knex');
            } finally {
                fs.rmSync(projectPath, { recursive: true, force: true });
            }
        });

        it('falls back to the knex peer dependency when a project-local knex module is missing', function () {
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

                expect(connection.client.config.client).toEqual('better-sqlite3');
                return connection.destroy();
            } finally {
                fs.rmSync(projectPath, { recursive: true, force: true });
            }
        });

        it('uses the knex major selected for the test run', function () {
            const knexVersion = require('../knex-version');

            expect(require('knex/package.json').version.split('.')[0]).toEqual(knexVersion);
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
                    expect.unreachable();
                })
                .catch(function (wrappedErr) {
                    expect(wrappedErr).toBeInstanceOf(errors.DatabaseError);
                    expect(wrappedErr.message).toEqual('Invalid database host.');
                    expect(wrappedErr.help).toEqual('Please double check your database config.');
                });
        });

        it('wraps unknown connection failures', function () {
            return database
                .ensureConnectionWorks({
                    raw: sinon.stub().rejects(new Error('permission denied')),
                })
                .then(function () {
                    expect.unreachable();
                })
                .catch(function (wrappedErr) {
                    expect(wrappedErr).toBeInstanceOf(errors.DatabaseError);
                    expect(wrappedErr.message).toEqual('permission denied');
                    expect(wrappedErr.help).toEqual('Unknown database error');
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
                    expect(createTable.called).toEqual(false);
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
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.KnexMigrateError);
                    expect(err.message).toEqual('Database is not supported.');
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
                    expect(connection.destroy.calledOnce).toEqual(true);
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
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err.message).toEqual('destroy failed');
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
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.KnexMigrateError);
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
                    expect(dropTableIfExists.calledOnceWith('migrations')).toEqual(true);
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
                    expect(raw.firstCall.calledWith('PRAGMA foreign_keys = OFF;')).toEqual(true);
                    expect(raw.thirdCall.calledWith('PRAGMA foreign_keys = ON;')).toEqual(true);
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
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.KnexMigrateError);
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
                    expect.unreachable();
                })
                .catch(function (err) {
                    expect(err).toBeInstanceOf(errors.KnexMigrateError);
                    expect(err.message).toEqual('Database client not supported: postgres');
                });
        });
    });
});
