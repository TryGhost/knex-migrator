# Agent Notes

`knex-migrator` is a CommonJS Node package and CLI for Knex-backed database
migrations. Use the README for the public API and command reference; this file
only records repo-local workflow details that are easy to get wrong.

## Runtime And Package Manager

- Use Node `22.13.1` or `24.14.1`; those are the supported package runtimes and
  the CI matrix versions.
- Use Corepack with the pinned package manager from `package.json`
  (`pnpm@11.9.0`). Do not switch repo commands back to Yarn or npm.
- For a clean local setup:

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Validation Commands

- `pnpm lint` runs oxlint and oxfmt checks.
- `pnpm test` runs the full Mocha suite, then `posttest` runs lint.
- `pnpm coverage` enforces the CI coverage floor: 80% lines, functions, and
  branches.
- Database-specific local test modes:

```bash
NODE_ENV=testing pnpm test
NODE_ENV=testing-better-sqlite3 pnpm test
NODE_ENV=testing-mysql pnpm test
```

`testing-mysql` expects a local MySQL-compatible server and the same
`database__connection__*` environment shape used by CI.

## Ghost Consumer Smoke

Run the Ghost smoke when changes affect CLI execution, migration flow,
database connection setup, Knex resolution, rollback behavior, or package
linking:

```bash
GHOST_CORE_PATH=/path/to/Ghost pnpm smoke:ghost
```

`GHOST_CORE_PATH` may point at either the Ghost repository root or
`ghost/core`. CI links this package into `Ghost/ghost/core` with pnpm and then
runs Ghost init, health, rollback, migrate, and health through the linked
`knex-migrator` binary.

## Files And Boundaries

- Do not commit generated or local output: `coverage/`, `.nyc_output/`,
  `node_modules/`, `test.db`, logs, or local `config.*.json` files outside
  `test/**`.
- Keep CLI entrypoints under `bin/` executable when editing them.
- Keep `pnpm-lock.yaml` and `pnpm-workspace.yaml` aligned with
  `package.json` when dependencies or install behavior changes.
- `pnpm ship` publishes the package when the worktree is clean and pushes tags;
  do not run it unless release work was explicitly requested.

## Style Notes

- Source and tests use CommonJS modules.
- Formatting is owned by oxfmt: 4-space indentation and single quotes.
- `no-console` is enforced outside scripts; keep diagnostic output in
  `scripts/` or use the existing logging/debug patterns.
