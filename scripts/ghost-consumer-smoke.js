#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const {createRequire} = require('module');
const os = require('os');
const path = require('path');
const compareVer = require('compare-ver');

const repoRoot = path.resolve(__dirname, '..');
const ghostPath = process.env.GHOST_CORE_PATH || process.argv[2] || path.join(repoRoot, '..', 'Ghost');
const migratorBin = path.resolve(process.env.KNEX_MIGRATOR_BIN || path.join(repoRoot, 'bin', 'knex-migrator'));
const migratorCwd = path.resolve(process.env.KNEX_MIGRATOR_CWD || (process.env.KNEX_MIGRATOR_BIN ? process.cwd() : repoRoot));

function resolveGhostCorePath(inputPath) {
    const resolvedPath = path.resolve(inputPath);
    const candidates = [
        resolvedPath,
        path.join(resolvedPath, 'ghost', 'core')
    ];

    const corePath = candidates.find((candidatePath) => {
        return fs.existsSync(path.join(candidatePath, 'package.json'))
            && fs.existsSync(path.join(candidatePath, 'MigratorConfig.js'));
    });

    if (!corePath) {
        fail('Ghost core package.json not found from ' + resolvedPath + '. Set GHOST_CORE_PATH to a Ghost repository or Ghost core checkout.');
    }

    return corePath;
}

const ghostCorePath = resolveGhostCorePath(ghostPath);
const ghostPackagePath = path.join(ghostCorePath, 'package.json');
const ghostRequire = createRequire(ghostPackagePath);

function fail(message) {
    console.error(message);
    process.exit(1);
}

function requireFromGhost(moduleName) {
    return ghostRequire(moduleName);
}

function sortVersions(versions) {
    return versions.sort((left, right) => compareVer.gt(left, right));
}

function runStep(name, args, env) {
    console.log('Running: ' + name);

    const result = childProcess.spawnSync(migratorBin, args, {
        cwd: migratorCwd,
        env: env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.stdout) {
        process.stdout.write(result.stdout);
    }

    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    if (result.status !== 0) {
        fail(name + ' failed with exit code ' + result.status);
    }
}

function getGhostVersion() {
    const result = childProcess.spawnSync(process.execPath, [
        '-e',
        'process.stdout.write(require("@tryghost/version").safe);'
    ], {
        cwd: ghostCorePath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.status !== 0) {
        if (result.stderr) {
            process.stderr.write(result.stderr);
        }

        fail('Could not read Ghost version from ' + ghostCorePath);
    }

    return result.stdout.trim();
}

function getGhostVersions() {
    const ghostVersion = getGhostVersion();
    const versionsPath = path.join(ghostCorePath, 'core', 'server', 'data', 'migrations', 'versions');

    const versions = sortVersions(fs.readdirSync(versionsPath).filter((entry) => {
        return !entry.startsWith('.') && fs.statSync(path.join(versionsPath, entry)).isDirectory();
    })).filter((version) => {
        return compareVer.gt(version, ghostVersion) !== 1;
    });

    const currentVersion = versions[versions.length - 1];
    const previousVersion = versions[versions.length - 2];

    if (!currentVersion || !previousVersion) {
        fail('Could not determine Ghost migration versions from ' + versionsPath);
    }

    return {
        ghostVersion,
        currentVersion,
        previousVersion
    };
}

function main() {
    if (!fs.existsSync(migratorBin)) {
        fail('knex-migrator bin not found at ' + migratorBin + '. Set KNEX_MIGRATOR_BIN to the linked package bin.');
    }

    requireFromGhost('knex');

    const versions = getGhostVersions();
    const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knex-migrator-ghost-smoke-'));
    const dbPath = path.join(tempPath, 'ghost-smoke.sqlite');
    const contentPath = path.join(tempPath, 'content');

    fs.mkdirSync(path.join(contentPath, 'data'), {recursive: true});

    const env = Object.assign({}, process.env, {
        NODE_ENV: 'testing',
        database__connection__filename: dbPath,
        paths__contentPath: contentPath
    });

    console.log('Ghost core: ' + ghostCorePath);
    console.log('knex-migrator bin: ' + migratorBin);
    console.log('knex-migrator cwd: ' + migratorCwd);
    console.log('Ghost version: ' + versions.ghostVersion);
    console.log('Rollback target: ' + versions.previousVersion);
    console.log('Forward target: ' + versions.currentVersion);

    try {
        runStep('Ghost migrate --init', ['migrate', '--mgpath', ghostCorePath, '--init'], env);
        runStep('Ghost health after init', ['health', '--mgpath', ghostCorePath], env);
        runStep('Ghost rollback to ' + versions.previousVersion, ['rollback', '--mgpath', ghostCorePath, '--force', '--v', versions.previousVersion], env);
        runStep('Ghost migrate to ' + versions.currentVersion, ['migrate', '--mgpath', ghostCorePath, '--v', versions.currentVersion, '--force'], env);
        runStep('Ghost health after rollback/migrate', ['health', '--mgpath', ghostCorePath], env);
    } finally {
        if (!process.env.KEEP_GHOST_SMOKE_DB) {
            fs.rmSync(tempPath, {recursive: true, force: true});
        } else {
            console.log('Kept smoke temp path: ' + tempPath);
        }
    }
}

main();
