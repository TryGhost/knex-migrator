const sinon = require('sinon');
const should = require('should');
const KnexMigrator = require('../../lib');
const utils = require('../../lib/utils');
const sandbox = sinon.createSandbox();

describe('Unit: _rollback', function () {
    afterEach(function () {
        sandbox.restore();
    });

    it('manual rollback', function () {
        const knexMigrator = new KnexMigrator({
            knexMigratorConfig: {
                database: {},
                migrationPath: 'location',
                currentVersion: '1.9'
            }
        });

        knexMigrator.connection = sandbox.stub().returns({
            where: sandbox.stub().returns({
                delete: sandbox.stub()
            })
        });

        const tasks = [
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '1-something'
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '2-something'
            }
        ];

        sandbox.stub(utils, 'readTasks').returns(tasks);

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

        knexMigrator.connection = sandbox.stub().returns({
            where: sandbox.stub().returns({
                delete: sandbox.stub()
            })
        });

        const tasks = [
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '1-something'
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '2-something'
            }
        ];

        sandbox.stub(utils, 'readTasks').returns(tasks);

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

        knexMigrator.connection = sandbox.stub().returns({
            where: sandbox.stub().returns({
                delete: sandbox.stub()
            })
        });

        const tasks = [
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '1-something',
                config: {
                    transaction: true
                }
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '2-something'
            }
        ];

        sandbox.stub(utils, 'readTasks').returns(tasks);

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

        knexMigrator.connection = sandbox.stub().returns({
            where: sandbox.stub().returns({
                delete: sandbox.stub()
            })
        });

        const tasks = [
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '1-something'
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '2-something'
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '3-something'
            },
            {
                up: sandbox.stub(),
                down: sandbox.stub().resolves(),
                name: '4-something'
            }
        ];

        sandbox.stub(utils, 'readTasks').returns(tasks);

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
});
