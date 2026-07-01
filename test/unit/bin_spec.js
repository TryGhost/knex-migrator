const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../../package.json');

const repoRoot = path.join(__dirname, '..', '..');

function writeFakeKnexMigrator(projectPath) {
    const modulePath = path.join(projectPath, 'node_modules', 'knex-migrator');

    fs.mkdirSync(modulePath, { recursive: true });
    fs.writeFileSync(
        path.join(modulePath, 'index.js'),
        `
const fs = require('fs');

class FakeKnexMigrator {
    constructor(options) {
        this.constructorOptions = options;
    }

    _record(method, options) {
        fs.writeFileSync(process.env.KNEX_MIGRATOR_RECORD, JSON.stringify({
            constructorOptions: this.constructorOptions,
            method,
            options: options || null
        }));

        return Promise.resolve();
    }

    init(options) {
        return this._record('init', options);
    }

    migrate(options) {
        return this._record('migrate', options);
    }

    reset(options) {
        return this._record('reset', options);
    }

    rollback(options) {
        return this._record('rollback', options);
    }

    isDatabaseOK() {
        return this._record('isDatabaseOK');
    }
}

module.exports = FakeKnexMigrator;
`,
    );
}

function createFakeProject() {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knex-migrator-cli-'));
    writeFakeKnexMigrator(projectPath);
    return projectPath;
}

function runBin(binName, args, projectPath) {
    const recordPath = path.join(projectPath, 'record.json');
    const result = childProcess.spawnSync(
        process.execPath,
        [path.join(repoRoot, 'bin', binName)].concat(args),
        {
            cwd: projectPath,
            env: Object.assign({}, process.env, {
                KNEX_MIGRATOR_RECORD: recordPath,
                LEVEL: 'fatal',
            }),
            encoding: 'utf8',
        },
    );

    let record = null;

    if (fs.existsSync(recordPath)) {
        record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    }

    return {
        result,
        record,
    };
}

describe('bin', function () {
    it('prints the root CLI version', function () {
        const result = childProcess.spawnSync(
            process.execPath,
            [path.join(repoRoot, 'bin', 'knex-migrator'), '--version'],
            {
                cwd: repoRoot,
                encoding: 'utf8',
            },
        );

        result.status.should.eql(0);
        result.stdout.trim().should.eql(pkg.version);
    });

    it('dispatches root CLI executable subcommands', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator',
                ['migrate', '--mgpath', mgpath, '--init', '--force'],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'migrate',
                options: {
                    force: true,
                    init: true,
                },
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('passes init options from Commander', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator-init',
                ['--mgpath', mgpath, '--skip', 'fixtures', '--only', 'settings'],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'init',
                options: {
                    skip: 'fixtures',
                    only: 'settings',
                },
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('passes migrate options from Commander', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator-migrate',
                ['--mgpath', mgpath, '--v', '6.50', '--only', 'core', '--force', '--init'],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'migrate',
                options: {
                    version: '6.50',
                    only: 'core',
                    force: true,
                    init: true,
                },
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('passes reset options from Commander', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator-reset',
                ['--mgpath', mgpath, '--force'],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'reset',
                options: {
                    force: true,
                },
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('passes rollback options from Commander', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator-rollback',
                ['--mgpath', mgpath, '--force', '--v', '6.48'],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'rollback',
                options: {
                    force: true,
                    version: '6.48',
                },
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('passes health options from Commander', function () {
        const projectPath = createFakeProject();
        const mgpath = path.join(projectPath, 'ghost-core');

        try {
            const { result, record } = runBin(
                'knex-migrator-health',
                ['--mgpath', mgpath],
                projectPath,
            );

            result.status.should.eql(0);
            record.should.eql({
                constructorOptions: {
                    knexMigratorFilePath: mgpath,
                    executedFromShell: true,
                },
                method: 'isDatabaseOK',
                options: null,
            });
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });
});
