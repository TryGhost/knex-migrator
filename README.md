# knex-migrator
DB migration tool for knex

## install
```npm install -g knex-migrator --save```

## config
`knex-migrator` needs a config file.
Please provide a file named `.knex-migrator` in your project root.

```
#!/usr/bin/env node

var config = require('./core/server/config');

module.exports = {
    database: config.get('database'),
    migrationPath: process.cwd() + '/core/server/data/migrations'
}
```

## usage
```
knex-migrator help
knex-migrator init
```

## structure of migration files
- init
  - 1-x
  - 2-x


## TODO
- [ ] re-design some of the files
- [ ] add missing migrate task
- [ ] add reset task
- [ ] add backup task
