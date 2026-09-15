const sinon = require('sinon');

const database = require('../../lib/database');
const errors = require('../../lib/errors');
const locking = require('../../lib/locking');

function createLockTable(data) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().returns({
                    then: function (callback) {
                        return Promise.resolve(data).then(callback);
                    },
                }),
            }),
        };
    };
}

function createUpdatableLockTable(data, update) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().resolves(data),
                update: update,
            }),
        };
    };
}

function createRejectedLockTable(err) {
    return function lockTable() {
        return {
            where: sinon.stub().returns({
                forUpdate: sinon.stub().returns(Promise.reject(err)),
            }),
        };
    };
}

describe('Locking', function () {
    afterEach(function () {
        sinon.restore();
    });

    describe('lock', function () {
        it('rejects when the migration lock row is missing', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createLockTable([]));
            });

            return locking
                .lock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
                });
        });

        it('wraps unexpected lock acquisition errors', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createRejectedLockTable(new Error('driver failed')));
            });

            return locking
                .lock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.LockError);
                    err.message.should.eql('Error while acquire the migration lock.');
                });
        });

        it('stores acquired_at as a local timestamp', async function () {
            sinon.useFakeTimers({ now: new Date(2026, 0, 2, 3, 4, 5), toFake: ['Date'] });
            const update = sinon.stub().resolves(1);

            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createUpdatableLockTable([{ locked: 0 }], update));
            });

            await locking.lock({});

            update.firstCall.args[0].should.eql({ locked: 1, acquired_at: '2026-01-02 03:04:05' });
        });
    });

    describe('isLocked', function () {
        it('returns false when the lock is released', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 0 }]),
            });

            return locking.isLocked(connection).then(function (result) {
                result.should.eql(false);
            });
        });

        it('rejects when the lock row is locked', function () {
            const connection = sinon.stub().returns({
                where: sinon.stub().resolves([{ locked: 1 }]),
            });

            return locking
                .isLocked(connection)
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
                });
        });
    });

    describe('unlock', function () {
        it('stores released_at as a local timestamp', async function () {
            sinon.useFakeTimers({ now: new Date(2026, 10, 12, 13, 14, 15), toFake: ['Date'] });
            const update = sinon.stub().resolves(1);

            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createUpdatableLockTable([{ locked: 1 }], update));
            });

            await locking.unlock({});

            update.firstCall.args[0].should.eql({ locked: 0, released_at: '2026-11-12 13:14:15' });
        });

        it('rejects when the migration lock row is already released', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createLockTable([{ locked: 0 }]));
            });

            return locking
                .unlock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.MigrationsAreLockedError);
                });
        });

        it('wraps unexpected unlock errors', function () {
            sinon.stub(database, 'createTransaction').callsFake(function (connection, callback) {
                return callback(createRejectedLockTable(new Error('driver failed')));
            });

            return locking
                .unlock({})
                .then(function () {
                    true.should.eql(false);
                })
                .catch(function (err) {
                    err.should.be.instanceof(errors.UnlockError);
                    err.message.should.eql('Error while releasing the migration lock.');
                });
        });
    });
});
