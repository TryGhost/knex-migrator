# knex-migrator
DB migration tool for knex

## install
```npm install -g knex-migrator --save```


## important facts
If you are using `mysql`, `knex-migrator` is able to create the database for you.
If it already exists, it skips. Don't forget to set your `connection.charset`.

## config
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
            name: 'ghost'
        }
    },
    migrationPath: process.cwd() + '/core/server/data/migrations',
    currentVersion: 'your-current-database-version',
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

## CLI usage

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
```

## JS usage
```
var KnexMigrator = require('knex-migrator');
var knexMigrator = new KnexMigrator({
    knexMigratorFilePath: 'path-to-migrator-config-file' [optional]
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

## hooks
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

| hook  |  description |
|---|---|---|---|---|
| before  |  is called before anything happens |
|  beforeEach | is called before each migration script  |
|  after | is called after everything happened  |
|  afterEach | is called after each migration script  |

index.js
```
exports.before = require('./before'); 
exports.beforeEach = = require('./before');
```

## your migration folder (example)
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

## Example migration file

```
var Promise = require('bluebird');
module.exports = function(options) {
  var transacting = options.transacting;
  
  ... 
  
  return Promise.resolve();
}
```

## debug
`DEBUG=knex-migrator:* knex-migrator health`

# Copyright & License

Copyright (c) 2016-2017 Ghost Foundation - Released under the [MIT license](LICENSE).
