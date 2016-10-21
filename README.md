# knex-migrator
DB migration tool for knex

## install
```npm install -g knex-migrator --save```


## important facts
If you are using `mysql`, `knex-migrator` is able to create the database for you.
If it already exists, it skips. Don't forget to set your `connection.charset`.

## config
`knex-migrator` requires a config file.
Please provide a file named `.knex-migrator` in your project root.


```
#!/usr/bin/env node

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
    currentVersion: 'your-current-database-version'
}
```

```
#!/usr/bin/env node

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

knex-migrator migrate [migrates your database to latest state, rolls back if an error happens]
knex-migrator migrate --v 1.2

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
`knexMigrator.init({disableHooks: true});`

The folder name must be `hooks` - this is not configureable right now.
Please create an index.js file to export your functions.

**before**      - is called before anything happens
**beforeEach**  - is called before each migration script
**after**       - is called after everything happened
**afterEach**   - is called after each migration script

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
- 1.0
  - 1-update-user.js
  - 2-change-permissions.js

## debug
`DEBUG=knex-migrator:* knex-migrator health`