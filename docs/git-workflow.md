# Git and release workflow

Work on `dev` for requested implementation and Preview validation. The user has
authorized implementing, verifying, committing and pushing requested changes to
`dev`. Use explicit, focused commits with English Conventional Commit messages,
for example `feat: translate the investment workspace to English`.

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
