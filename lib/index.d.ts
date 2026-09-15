import type { Knex } from 'knex';

declare namespace KnexMigrator {
    /**
     * Shape of `MigratorConfig.js` (or `.cjs`/`.mjs` default export), or the
     * object passed as `knexMigratorConfig`.
     */
    interface Config {
        /** Knex configuration used to connect to the database. */
        database: Knex.Config;
        /** Absolute path to the folder containing `init`, `hooks` and version folders. */
        migrationPath: string;
        /** Current version of the project, e.g. `'2.0'`. */
        currentVersion: string;
        /** Folder under `migrationPath` holding version folders. Defaults to `'versions'`. */
        subfolder?: string;
    }

    interface ConstructorOptions {
        /** Directory containing `MigratorConfig.js`. Defaults to `process.cwd()`. */
        knexMigratorFilePath?: string;
        /** Inline config. Takes precedence over `knexMigratorFilePath`. */
        knexMigratorConfig?: Config;
        /** Passed to `shutdown` hooks. Set by the CLI. */
        executedFromShell?: boolean;
    }

    /**
     * A 1-based script index. The CLI passes these through as strings, so
     * numeric strings (`'2'`) are accepted alongside numbers. Non-numeric
     * values coerce to `NaN` at runtime and select nothing.
     */
    type ScriptIndex = number | `${number}`;

    interface InitOptions {
        /** Do not load `hooks/init`. */
        disableHooks?: boolean;
        /** Only create the database, do not run any init scripts. */
        noScripts?: boolean;
        /** Do not record existing version migrations as executed after init. */
        skipInitCompletion?: boolean;
        /** 1-based index of the only init script to run. */
        only?: ScriptIndex;
        /** 1-based index of an init script to skip. */
        skip?: ScriptIndex;
    }

    interface MigrateOptions {
        /** Only migrate this version. */
        version?: string;
        /** Run migrations for versions greater than `currentVersion`. */
        force?: boolean;
        /** Run `init` before migrating. */
        init?: boolean;
        /** 1-based index of the only migration file to run. Requires `version`. */
        only?: ScriptIndex;
    }

    interface ResetOptions {
        /** Drop the database without checking or acquiring the migration lock. */
        force?: boolean;
    }

    interface RollbackOptions {
        /** Roll back even when the migration lock is not held. */
        force?: boolean;
        /** Roll back all migrations newer than this version. */
        version?: string;
        /** Alias for `version`. */
        v?: string;
        /** Do not load `hooks/init`. */
        disableHooks?: boolean;
    }

    /**
     * Argument passed to a migration's `up`/`down` function. `transacting` is
     * set when `config.transaction` is true, otherwise `connection` is set.
     */
    interface MigrationContext {
        connection?: Knex;
        transacting?: Knex.Transaction;
    }

    interface MigrationConfig {
        /** Run `up`/`down` inside a transaction. */
        transaction?: boolean;
        /** Prevent rolling back past this migration. */
        irreversible?: boolean;
    }

    /** Exports of a migration or init script file. */
    interface Migration {
        config?: MigrationConfig;
        up: (options: MigrationContext) => unknown;
        down?: (options: MigrationContext) => unknown;
    }

    interface HookContext {
        connection: Knex;
    }

    interface ShutdownHookContext {
        executedFromShell?: boolean;
    }

    /** Exports of `hooks/init/index.js` or `hooks/migrate/index.js`. */
    interface Hooks {
        before?: (options: HookContext) => unknown;
        beforeEach?: (options: HookContext) => unknown;
        afterEach?: (options: HookContext) => unknown;
        after?: (options: HookContext) => unknown;
        shutdown?: (options: ShutdownHookContext) => unknown;
    }
}

declare class KnexMigrator {
    constructor(options?: KnexMigrator.ConstructorOptions);

    executedFromShell: boolean | undefined;
    currentVersion: string;
    migrationPath: string;
    subfolder: string;
    dbConfig: Knex.Config;
    knexModulePath: string;
    /** Knex instance for the most recent command. Destroyed when the command finishes. */
    connection?: Knex;

    /** Create the database if needed and run init scripts. */
    init(options?: KnexMigrator.InitOptions): Promise<void>;
    /** Run pending migrations. */
    migrate(options?: KnexMigrator.MigrateOptions): Promise<void>;
    /** Drop the database, or every table for SQLite. */
    reset(options?: KnexMigrator.ResetOptions): Promise<void>;
    /**
     * Resolve when the database is initialised and fully migrated. Rejects with
     * a `DatabaseIsNotOkError` whose `code` is `DB_NOT_INITIALISED`,
     * `DB_NEEDS_MIGRATION`, `MIGRATION_STATE_ERROR` or
     * `MIGRATION_TABLE_IS_MISSING` otherwise.
     */
    isDatabaseOK(): Promise<void>;
    /** Roll back migrations for the current version, or to `options.version`. */
    rollback(options?: KnexMigrator.RollbackOptions): Promise<void>;
}

export = KnexMigrator;
