# knex-migrator

`knex-migrator` is a database migration library and CLI built on [Knex](https://knexjs.org/) for projects that need ordered init scripts, versioned migrations, health checks, locking, and rollback support.

It is maintained by Ghost and is used by [Ghost](https://github.com/TryGhost/Ghost) to run schema setup and migrations in production.

## Features

- JavaScript API and CLI commands
- Separate database initialization and migration flows
- Database creation for MySQL-compatible targets
- Migration hooks for `init` and `migrate`
- Health checks against the current schema version
- Rollback to a previous migration version
- Automatic rollback when a migration fails
- Migration locking to avoid parallel runs
- Transaction support, including separate DML and DDL scripts
- Custom migration folder structure
- Debug logging with `DEBUG=knex-migrator:*`

## Install

```bash
pnpm add knex-migrator
```

`npm install knex-migrator --save` also works for npm-based projects. For global CLI usage:

```bash
npm install --global knex-migrator
```

## Requirements

- Node.js `^22.13.1 || ^24.14.1`
- A compatible Knex installation. `knex-migrator` first tries to load `knex` from the project path passed with `--mgpath` or `knexMigratorFilePath`, then falls back to its bundled Knex `2.4.2`.
- A database client supported by this package: `mysql`, `mysql2`, `sqlite3`, or `better-sqlite3`

The `mysql` client name is accepted for backwards compatibility and is mapped to `mysql2`.

## Configuration

Add `MigratorConfig.js` to the project root that will run migrations. CLI commands load this file from the current working directory by default, or from the directory passed with `--mgpath`.

```js
module.exports = {
    database: {
        client: 'sqlite3',
        connection: {
            filename: '/path/to/database.sqlite'
        }
    },
    migrationPath: '/path/to/project/migrations',
    currentVersion: '2.0',
    subfolder: 'versions'
};
```

For MySQL:

```js
module.exports = {
    database: {
        client: 'mysql2',
        connection: {
            host: '127.0.0.1',
            user: 'root',
            password: 'root',
            database: 'example',
            charset: 'utf8mb4'
        }
    },
    migrationPath: '/path/to/project/migrations',
    currentVersion: '2.0'
};
```

`subfolder` is optional and defaults to `versions`.

## Migration Structure

The default migration layout separates one-time init scripts from versioned migrations.

```text
project/
  migrations/
    hooks/
      init/
        index.js
      migrate/
        index.js
    init/
      1-add-tables.js
    versions/
      1.0/
        1-add-events-table.js
        2-normalise-settings.js
      2.0/
        1-add-timestamps-columns.js
```

Version folders are sorted in migration order. Each migration file can export `up`, `down`, and an optional `config` object.

```js
module.exports.config = {
    transaction: true
};

module.exports.up = async function up(options) {
    const connection = options.transacting || options.connection;

    await connection.schema.createTable('events', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
    });
};

module.exports.down = async function down(options) {
    const connection = options.transacting || options.connection;

    await connection.schema.dropTable('events');
};
```

Write both `up` and `down` whenever possible so failed migrations and manual rollbacks can return the database to a known state. Avoid mixing DDL and DML in one transactional migration for MySQL because DDL statements use implicit commits.

## Hooks

Hooks live under `migrations/hooks/init` or `migrations/hooks/migrate`. Export any of these functions from the hook folder's `index.js`:

| Hook | When it runs |
| --- | --- |
| `before` | Before the command starts running scripts |
| `beforeEach` | Before each migration script |
| `afterEach` | After each migration script |
| `after` | After all scripts finish |
| `shutdown` | Before the migrator disconnects |

Hook functions receive the current Knex connection where applicable. `shutdown` receives `{executedFromShell}`.

## CLI

```bash
knex-migrator --help
```

```text
Usage: knex-migrator [options] [command]

Options:
  -v, --version       output the version number
  -h, --help          display help for command

Commands:
  init|i [config]     init db
  migrate|m [config]  migrate db
  reset|r             reset db
  health|h            health of db
  rollback|ro         rollbacks your db
  help [command]      display help for command
```

Common commands:

```bash
knex-migrator init --mgpath /path/to/project
knex-migrator migrate --mgpath /path/to/project
knex-migrator migrate --mgpath /path/to/project --v 2.0 --force
knex-migrator migrate --mgpath /path/to/project --init
knex-migrator rollback --mgpath /path/to/project --force --v 1.0
knex-migrator health --mgpath /path/to/project
knex-migrator reset --mgpath /path/to/project --force
```

`migrate --only <file>` can run one file within the target version when combined with `--v`. `init` supports `--only` and `--skip` for init scripts.

If a process exits while migrations are running, the migration lock may remain in place. Inspect the `migrations` and `migrations_lock` tables before forcing rollback or reset.

## JavaScript API

```js
const KnexMigrator = require('knex-migrator');

const migrator = new KnexMigrator({
    knexMigratorFilePath: process.cwd()
});
```

You can also pass config directly:

```js
const migrator = new KnexMigrator({
    knexMigratorConfig: {
        database: {
            client: 'sqlite3',
            connection: {
                filename: '/path/to/database.sqlite'
            }
        },
        migrationPath: '/path/to/project/migrations',
        currentVersion: '2.0'
    }
});
```

Available methods:

- `init(options)`
- `migrate(options)`
- `rollback(options)`
- `reset(options)`
- `isDatabaseOK()`

Example:

```js
migrator.isDatabaseOK()
    .then(function () {
        // Database is initialized and migrated.
    })
    .catch(function (err) {
        if (err.code === 'DB_NOT_INITIALISED') {
            return migrator.init();
        }

        if (err.code === 'DB_NEEDS_MIGRATION') {
            return migrator.migrate();
        }

        throw err;
    });
```

## Development

This repo uses pnpm and Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm coverage
```

Useful test variants:

```bash
NODE_ENV=testing pnpm test
NODE_ENV=testing-better-sqlite3 pnpm test
NODE_ENV=testing-mysql pnpm test
```

CI runs linting, coverage on Node `22.13.1` and `24.14.1` across sqlite3, better-sqlite3, and MySQL 8, plus a Ghost consumer smoke test. The smoke test checks out Ghost, links this package into Ghost core, then runs Ghost init, health, rollback, migrate, and health checks through the CLI.

To run the Ghost smoke locally, place a Ghost checkout next to this repo or set `GHOST_CORE_PATH`:

```bash
GHOST_CORE_PATH=/path/to/Ghost pnpm smoke:ghost
```

## Publish

```bash
pnpm ship
```

## License

Copyright (c) 2013-2026 Ghost Foundation. Released under the [MIT license](LICENSE).
