# My portfolio

A personal investment workspace built with Next.js, React, Prisma and PostgreSQL.
The application uses English for its interface, current documentation, code comments
and new commit messages. Brazilian product names and benchmarks, including Tesouro
Direto, Selic, CDI and IPCA, retain their official names.

## Application

- Overview: consolidated value, history, allocation and rebalancing projections.
- Positions: assets, accounts, classifications, transactions and market quotes.
- Settings: allocation targets, tolerance, account access and JSON backups.

Family expenses, payroll/income and the separate pension dashboard are retired.
Their database tables remain intact; this change does not delete financial data.
Pension investments can still be held and classified within the portfolio.

## Development

Use Node 24.20.x and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm exec prisma generate
pnpm dev
```

Configure `DATABASE_URL` with the Neon **development** branch, never production.
Keep `.env`, authentication tokens and financial backups out of Git.
Use a fresh `BETTER_AUTH_SECRET` for local development. `AUTH_ALLOWED_EMAILS`
controls registration; an empty value disables signup. The application uses
Better Auth directly rather than Neon Auth.

For local PostgreSQL instead of Neon, use `pnpm db:up` and the local connection
from `.env.example`. Apply existing migrations with `pnpm exec prisma migrate deploy`.
Create new migrations only in an isolated development database.

## Verification

```sh
pnpm check
pnpm exec prisma validate
node --import tsx --test tests/unit/*.test.ts
pnpm build
```

Browser tests require an isolated test database, `E2E_USER_EMAIL` and
`E2E_USER_PASSWORD`. Do not run tests that write against production or personal
investment records. The UI keeps legacy taxonomy keys and translates only their
labels, preserving version-5 backups and existing allocations.

## Deployment workflow

Repository: `vnara19/my-portifolio`.

- `dev` deploys to Vercel Preview, connected to Neon `development`.
- `main` deploys to Vercel Production, connected to Neon `production`.
- Requested changes may be implemented, tested, committed and pushed to `dev`.
- Publish to `main` only after explicit approval of the reviewed change.

Production migration builds use `DATABASE_URL_UNPOOLED`. Preview migrations must
use the development branch connection; never borrow the production connection.
The current Vercel build command applies migrations only in Production. For any
future schema change, migrate development explicitly before testing the Preview.

## Market data

GitHub Actions runs the quote job hourly at minute 17 and supports manual runs.
Only symbols due for refresh are fetched. Current quotes become due after 50
minutes; history failures retry after 24 hours. The displayed update time is the
last successful quote write, not the last idle job invocation.

Providers include Yahoo Finance, CoinGecko, Coinbase, Banco Central and Tesouro
Direto, with configurable alternatives. See [quote sync](docs/quote-sync-job.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Style guide](docs/style-guide.md)
- [Git workflow](docs/git-workflow.md)
- [Backup format](docs/backup-format.md)
- [Agent instructions](AGENTS.md)

Earlier specifications and discovery notes under `.ai/` are historical reference
material in their original language. Legacy spreadsheet/VBA files and applied SQL
migrations are historical artifacts, not current product instructions. Preserve
applied migration contents and commit authorship.

The overview uses USD reporting with EUR/BRL equivalents. Balance-change percentages
include historical exchange-rate movements and cash flows. EUR uses public daily
ECB reference rates via Frankfurter; no new API account is required. Position entry
and internal valuation still use the existing BRL/USD contracts in this first stage.
