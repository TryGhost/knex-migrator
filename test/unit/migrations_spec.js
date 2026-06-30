const sinon = require('sinon');

const addPrimaryKeyToLockTable = require('../../migrations/add-primary-key-to-lock-table');
const fieldLength = require('../../migrations/field-length');
const lockTable = require('../../migrations/lock-table');
const useIndex = require('../../migrations/use-index');

describe('Migrations', function () {
    describe('add-primary-key-to-lock-table', function () {
        it('skips sqlite primary key creation when the constraint exists', function () {
            const table = sinon.stub();
            const connection = {
                client: {
                    config: {
                        client: 'sqlite3',
                    },
                },
                raw: sinon.stub().resolves([{ origin: 'pk' }]),
                schema: {
                    table: table,
                },
            };

            return addPrimaryKeyToLockTable.up(connection).then(function () {
                table.called.should.eql(false);
            });
        });

        it('creates sqlite primary keys when the constraint is missing', function () {
            const primary = sinon.stub();
            const table = sinon.stub().callsFake(function (tableName, callback) {
                tableName.should.eql('migrations_lock');
                callback({
                    primary: primary,
                });
                return Promise.resolve();
            });
            const connection = {
                client: {
                    config: {
                        client: 'sqlite3',
                    },
                },
                raw: sinon.stub().resolves([]),
                schema: {
                    table: table,
                },
            };

            return addPrimaryKeyToLockTable.up(connection).then(function () {
                primary.calledWith('lock_key').should.eql(true);
            });
        });

        it('skips duplicate mysql primary key errors', function () {
            const duplicatePrimaryKeyError = new Error('multiple primary keys');
            duplicatePrimaryKeyError.code = 'ER_MULTIPLE_PRI_KEY';

            const connection = {
                client: {
                    config: {
                        client: 'mysql2',
                    },
                },
                schema: {
                    table: sinon.stub().rejects(duplicatePrimaryKeyError),
                },
            };

            return addPrimaryKeyToLockTable.up(connection);
        });

        it('rejects unexpected mysql primary key errors', function () {
            const connection = {
                client: {
                    config: {
                        client: 'mysql2',
                    },
                },
                schema: {
                    table: sinon.stub().rejects(new Error('table missing')),
                },
            };

            return addPrimaryKeyToLockTable
                .up(connection)
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.message.should.eql('table missing');
                });
        });
    });

    describe('lock-table', function () {
        it('creates the migration lock table', function () {
            const primary = sinon.stub();
            const nullable = sinon.stub().returns({ primary: primary });
            const defaultValue = sinon.stub();
            const string = sinon.stub().returns({ nullable: nullable });
            const boolean = sinon.stub().returns({ default: defaultValue });
            const dateTime = sinon.stub().returns({ nullable: sinon.stub() });
            const insert = sinon.stub().resolves();
            const connection = sinon.stub().returns({ insert: insert });

            connection.schema = {
                hasTable: sinon.stub().resolves(false),
                createTable: sinon.stub().callsFake(function (tableName, callback) {
                    tableName.should.eql('migrations_lock');
                    callback({
                        string: string,
                        boolean: boolean,
                        dateTime: dateTime,
                    });
                    return Promise.resolve();
                }),
            };

            return lockTable.up(connection).then(function () {
                string.calledWith('lock_key', 191).should.eql(true);
                nullable.calledWith(false).should.eql(true);
                primary.calledOnce.should.eql(true);
                boolean.calledWith('locked').should.eql(true);
                defaultValue.calledWith(0).should.eql(true);
                dateTime.calledWith('acquired_at').should.eql(true);
                dateTime.calledWith('released_at').should.eql(true);
                connection.calledWith('migrations_lock').should.eql(true);
                insert
                    .calledWith({
                        lock_key: 'km01',
                        locked: 0,
                    })
                    .should.eql(true);
            });
        });

        it('does nothing when the migration lock table already exists', function () {
            const connection = {
                schema: {
                    hasTable: sinon.stub().resolves(true),
                    createTable: sinon.stub(),
                },
            };

            return lockTable.up(connection).then(function () {
                connection.schema.createTable.called.should.eql(false);
            });
        });

        it('wraps sqlite locked errors while creating the migration lock table', function () {
            const connection = sinon.stub();
            const lockedError = new Error('database is locked');
            lockedError.errno = 5;

            connection.schema = {
                hasTable: sinon.stub().resolves(false),
                createTable: sinon.stub().returns(Promise.reject(lockedError)),
            };

            return lockTable
                .up(connection)
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.name.should.eql('MigrationsAreLockedError');
                });
        });

        it('rejects unexpected errors while creating the migration lock table', function () {
            const connection = sinon.stub();

            connection.schema = {
                hasTable: sinon.stub().resolves(false),
                createTable: sinon.stub().returns(Promise.reject(new Error('create failed'))),
            };

            return lockTable
                .up(connection)
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.message.should.eql('create failed');
                });
        });
    });

    describe('field-length', function () {
        it('does nothing when the migrations table does not exist', function () {
            const alterTable = sinon.stub();
            const connection = {
                schema: {
                    hasTable: sinon.stub().resolves(false),
                    alterTable: alterTable,
                },
            };

            return fieldLength.up(connection).then(function () {
                alterTable.called.should.eql(false);
            });
        });
    });

    describe('use-index', function () {
        it('does nothing when the migrations table does not exist', function () {
            const alterTable = sinon.stub();
            const connection = {
                schema: {
                    hasTable: sinon.stub().resolves(false),
                    alterTable: alterTable,
                },
            };

            return useIndex.up(connection).then(function () {
                alterTable.called.should.eql(false);
            });
        });
    });
});
