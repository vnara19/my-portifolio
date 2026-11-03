# Git and release workflow

Work on `dev`. Codex implements requested changes, runs appropriate checks,
commits and pushes them, publishes the Vercel Preview and verifies the deployment.
The user has restored this end-to-end workflow; local manual review is optional.

Data entered in the Vercel test environment is real user data. Preserve holdings,
transactions, authentication records and backups. Never reset, reseed, replace or
delete this data for testing. Any tests that write must use an isolated test schema.
Keep checks proportional and avoid redundant builds or repeated broad test runs.

Local development from the repository folder, using the existing bundled runtime:

```sh
../bin/node node_modules/next/dist/bin/next dev --webpack
```

Open http://localhost:3000 and stop the server with Ctrl+C. Local execution uses
the configured environment/database; it does not automatically create an isolated
local database. Use the development connection and never production for testing.

Review `git diff`, stage only intended source changes, commit and push `dev` for
Preview. Publishing `main` remains a separate release requiring user approval.
Never stage environment files or personal backups.

Vercel deploys `dev` to Preview with the Neon `development` connection. Do not test
writes against production. New database migrations must be applied to development
before a schema-changing Preview is tested.

Publish reviewed changes to `main` only when the user explicitly approves release.
Approval to implement or Preview a feature does not imply approval to publish it.
Before release, compare both branches, preserve the quote schedule and enabled dev
Preview, verify migrations and ensure no secret or backup is staged.

`main` deploys production and applies committed migrations via the direct database
connection. Confirm the deployment reaches Ready and check health/runtime behavior.
Never rewrite old commit authorship or messages just to change their language.

Each commit should express a coherent change. Use `feat`, `fix`, `docs`, `refactor`,
`test`, `build` or `ci` as appropriate; mark breaking changes explicitly.
