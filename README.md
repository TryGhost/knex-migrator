# knex-migrator
DB migration tool for knex

## install
```npm install -g knex-migrator --save```

## config
`knex-migrator` needs a config file.
Please provide a file named `.knex-migrator` in your project root.


```
#!/usr/bin/env node

module.exports = {
    database: {client: 'mysql', connection: {host: '127.0.0.1', user: 'user', password: 'password'}},
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
var knexMigrator = new KnexMigrator({
  database: database
  migrationPath: '...'
});

// check your database health
knexMigrator.isDatabaseOK();

// execute db init
knexMigrator.init();
```

## your migration folder (example)
- init
  - 1-create-database
  - 2-create-tables
  - 3-seed


## TODO
- [x] re-design some of the files
- [ ] tests
- [ ] add missing migrate task
- [ ] add reset task
- [ ] add backup task
