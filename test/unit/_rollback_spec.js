const sinon = require('sinon');
const should = require('should');
const KnexMigrator = require('../../lib');
const utils = require('../../lib/utils');

describe('Unit: _rollback', function () {
    afterEach(function () {
        sinon.restore();
    });

    it('manual rollback', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '1.9'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '1.10'
        }).then(function () {
            tasks[0].down.called.should.eql(true);
            tasks[1].down.called.should.eql(true);
        });
    });

    it('rollback caused by an error during migration', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '1.9'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '1.10',
            task: tasks[0]
        }).then(function () {
            tasks[0].down.called.should.eql(true);
            tasks[1].down.called.should.eql(false);
        });
    });

    it('rollback caused by an error during migration', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '1.9'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something',
                config: {
                    transaction: true
                }
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '1.10',
            task: tasks[0]
        }).then(function () {
            tasks[0].down.called.should.eql(false);
            tasks[1].down.called.should.eql(false);
        });
    });

    it('rollback caused by an error during migration', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '1.9'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '3-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '4-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '1.10',
            task: tasks[2]
        }).then(function () {
            tasks[0].down.called.should.eql(true);
            tasks[1].down.called.should.eql(true);
            tasks[2].down.called.should.eql(true);
            tasks[3].down.called.should.eql(false);
        });
    });

    it('aborts with irreversible migrations in manual rollback', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '3.0'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something'
            },
            {
                config: {irreversible: true},
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '3-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '2.31'
        }).then(function () {
            true.should.eql(false);
        }).catch((err) => {
            should.exist(err);
            err.errorType.should.eql('IrreversibleMigrationError');
            tasks[0].down.called.should.eql(false);
            tasks[1].down.called.should.eql(false);
            tasks[2].down.called.should.eql(false);
        });
    });

    it('aborts with irreversible migrations in automatical failure rollback', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '3.0'
            }
        });

        knexMigrator.connection = sinon.stub().returns({
            where: sinon.stub().returns({
                delete: sinon.stub()
            })
        });

        const tasks = [
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '1-something'
            },
            {
                config: {irreversible: true},
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '2-something'
            },
            {
                up: sinon.stub(),
                down: sinon.stub().resolves(),
                name: '3-something'
            }
        ];

        sinon.stub(utils, 'readTasks').returns(tasks);

        return knexMigrator._rollback({
            version: '2.31',
            task: tasks[2]
        }).then(function () {
            true.should.eql(false);
        }).catch((err) => {
            should.exist(err);
            err.errorType.should.eql('IrreversibleMigrationError');
            tasks[0].down.called.should.eql(false);
            tasks[1].down.called.should.eql(false);
            tasks[2].down.called.should.eql(false);
        });
    });
});
