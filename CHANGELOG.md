# knex-migrator Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="3.0.4"></a>
# [3.0.4](https://github.com/TryGhost/Ghost-CLI/compare/3.0.3...v3.0.4) (2017-11-04)

### Fixes

* Fixed rollback for init scripts


<a name="3.0.3"></a>
# [3.0.3](https://github.com/TryGhost/Ghost-CLI/compare/3.0.2...v3.0.3) (2017-11-04)

### Fixes

* Fixed `--force` flag for `knex-migrator rollback`

<a name="3.0.1"></a>
# [3.0.1](https://github.com/TryGhost/Ghost-CLI/compare/3.0.0...v3.0.1) (2017-11-03)

<a name="3.0.2"></a>
# [3.0.2](https://github.com/TryGhost/Ghost-CLI/compare/3.0.1...v3.0.2) (2017-11-03)

### Fixes

* Fixed missing throw/catch behaviour,

<a name="3.0.1"></a>
# [3.0.1](https://github.com/TryGhost/Ghost-CLI/compare/3.0.0...v3.0.1) (2017-11-03)

### Fixes

* Fixed binary for `knex-migrator rollback`

<a name="3.0.0"></a>
# [3.0.0](https://github.com/TryGhost/Ghost-CLI/compare/2.1.9...v3.0.0) (2017-11-03)


### Breaking Changes
* You have to export `up` and `down` in your migration scripts. `down` is optional, but highly recommended, otherwise on failure your changes won't rollback completely.
* The `options` object which is passed into the migration script contains now by default a connection object. (`options.connection`). You have to explicit enable transactions, see README.
* A new migrations lock table get's added as soon as you run **any** command. You don't have to worry about that.
* Expect bug fixes in the upcoming days.

### Features

* Support full rollback (auto rollback on error)
* Shutdown hook
* Concurrency and locking
* A new shiny `rollback` command for manual rollback if needed.

<a name="2.1.9"></a>
# [2.1.9](https://github.com/TryGhost/Ghost-CLI/compare/2.1.8...v2.1.9) (2017-10-26)

### Features

* Enabled Node 8 Support

<a name="2.1.8"></a>
# [2.1.9](https://github.com/TryGhost/Ghost-CLI/compare/2.1.7...v2.1.8) (2017-10-24)

### Fixes

* Fixed migration order on db initialisation
