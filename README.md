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
    migrationPath: process.cwd() + '/core/server/data/migrations'
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
    migrationPath: process.cwd() + '/core/server/data/migrations'
}
```

## CLI usage
```
knex-migrator help
knex-migrator init
knex-migrator init --skip 1
knex-migrator init --only 1
```

## JS usage
```
var KnexMigrator = require('knex-migrator');
var knexMigrator = new KnexMigrator();

// check your database health
knexMigrator.isDatabaseOK();

// execute db init
knexMigrator.init();
```

## your migration folder (example)
- init
  - 1-create-tables
  - 2-seed

