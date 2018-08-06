# knex-migrator

> Database migration tool for [knex](https://github.com/tgriesser/knex).

## Supported Databases

### MySQL, Sqlite3

**Note: Replicas are unsupported, because knex doesn't support them.**

## Features

- Locks for concurrency
- Full rollback to latest version
- Full CLI and JS API
- Hooks
- Differentiation between database initialisation and migration
    - Support for a database schema, [like we use in Ghost](https://github.com/TryGhost/Ghost/blob/1.16.2/core/server/data/schema/schema.js)
- Support for database creation

## Other migration tools

##### Knex Migrations

Read [here](https://github.com/TryGhost/Ghost/issues/7489) what the major downsides of knex migrations are.

##### DB-Migrate

Latest version [uses autocommit](https://github.com/db-migrate/mysql/blob/v1.1.10/index.js#L25) to handle database migrations, which **does not solve** the problem of DDL/DML statements in MySQL.
If you are interested in why, continue reading [here](https://github.com/tgriesser/knex/issues/2290).

Furthermore they don't support a full set of features e.g. full atomic rollbacks.

## Installation
```
npm install -g knex-migrator
npm install knex-migrator --save
yarn add knex-migrator
```

## MigratorConfig
`knex-migrator` requires a config file.
Please provide a file named `MigratorConfig.js` in your project root.


```
module.exports = {
    database: {
        client: 'mysql',
        connection: {
            host: '127.0.0.1',
            user: 'user',
            password: 'password',
            charset: 'utf8',
            database: 'ghost'
        }
    },
    migrationPath: process.cwd() + '/core/server/data/migrations',
    currentVersion: 'your-current-database/project-version',
    subfolder: 'upgrades'  [default: versions]
}
```

```
module.exports = {
    database: {
        client: 'sqlite3',
        connection: {
            filename: 'path/to/your.db'
        }
    },
    migrationPath: process.cwd() + '/core/server/data/migrations',
    currentVersion: 'your-current-database-version'
}
```

Note that if you are using the [Ghost-CLI](https://github.com/TryGhost/Ghost-CLI) the `migrationPath` parameter should point to the `current` directory:
```js
migrationPath: process.cwd() + '/current/core/server/data/migrations'
```

## API

### CLI

```
knex-migrator help
knex-migrator health [shows the database health]

knex-migrator init [initialises your database based on your init scripts]
knex-migrator init --skip 1
knex-migrator init --only 1
knex-migrator init --mgpath <path-to-MigratorConfig.js>

knex-migrator migrate [migrates your database to latest state, rolls back if an error happens]
knex-migrator migrate --v 1.2
knex-migrator migrate --v 1.2 --force [doesn't matter which current version you are on, we force executing the version]
knex-migrator migrate --init [avoids running `init`, a combined command]
knex-migrator migrate --init --mgpath <path-to-MigratorConfig.js>

knex-migrator reset [resets your database]
knex-migrator reset --force [resets your database and ignores the migration lock]

knex-migrator rollback
knex-migrator rollback --force
knex-migrator rollback --force --v 1.20.0
```

### JS
```
var KnexMigrator = require('knex-migrator');
var knexMigrator = new KnexMigrator({
    knexMigratorFilePath: 'path-to-migrator-config-file' [optional]
    // or
    knexMigratorConfig: { ... } [optional]
});

// check your database health
knexMigrator.isDatabaseOK()
  .then(function() {
     // database is OK
  })
  .catch(function(err) {
     // err contains a specific code, based on that code you decide (err.code)

     // database is not initialised?
     knexMigrator.init();

     // database is not migrated?
     knexMigrator.migrate();
  });

```

## Hooks
Knex-migrator offers you to hook into the process of executing scripts.
The hooks won't work for initialisation right now.
All hooks are optional.
Hooks need to live in the `migrationPath` you have offered.

You can disable the hooks passing:
```
knexMigrator.init({
  disableHooks: true,           [optional]
  noScripts: true | false       [optional]
});
```

The folder name must be `hooks` - this is not configureable right now.
Please create an index.js file to export your functions.

|hook|description|
|---|---|
|before|is called before anything happens|
|beforeEach| is called before each migration script|
|after|is called after everything happened|
|afterEach|is called after each migration script|
|shutdown|is called before the migrator shuts down [no database access]|


index.js
```
exports.before = require('./before');
exports.beforeEach = = require('./before');
```

## Migration Folder Example
- hooks
  - migrate
    - before.js
    - index.js
  - init
    - after.js
    - index.js
- init
  - 1-create-tables.js
  - 2-seed.js
- versions
  - 1.0
    - 1-update-user.js
    - 2-change-permissions.js

## Migration Files

### Transactions
You can enable transactions per migration script.

```
module.exports.config = {
  transaction: true
}
```


### Example
```
var Promise = require('bluebird');
module.exports.up = function(options) {
  var connection = options.connection;

  ...

  return Promise.resolve();
};

module.exports.down = function(options) {
  var connection = options.connection;

  ...

  return Promise.resolve();
}
```

#### Important
Don't mix DDL/DML statements in a migration script. In MySQL DDL statements use implicit commits. Furthermore it's highly recommended to write both the `up` and the `down` function to ensure a **full** rollback.


## Knowledge Base

### Shutdown during migrations
If your process dies while migrations are running, knex-migrator won't be able to release the migration lock.
To release to lock you can run `knex-migrator rollback`. **But** it's recommended to check your database first to see in which state it is.
You can check the tables `migrations` and `migrations_lock`. The rollback will rollback any migrations which were executed on your current project version.

### Sqlite and Locks

Sqlite does **not** support read locks by default. That's why locks/concurrency is not supported atm.

## Debug
`DEBUG=knex-migrator:* knex-migrator health`

## Test
- `yarn lint` run just eslint
- `yarn test` run lint && tests
- `NODE_ENV=testing-mysql yarn test` to test with MySQL

## Publish
- `yarn ship`

# Copyright & License

Copyright (c) 2017-2018 Ghost Foundation - Released under the [MIT license](LICENSE).
