# Project instructions

My portfolio is Victor's personal investment application. Work in English for
source comments, interface copy, current documentation and new commit messages.
Preserve proper names such as Tesouro Direto, Selic, CDI, IPCA and exchange tickers.

## Scope and references

The active product has Overview, Positions, Quotes and Settings. Family expenses,
payroll/income and the separate pension dashboard are retired. Do not reintroduce
these areas or a sidebar without a new user request. Do not build salary tracking
or a TradingView redesign as part of the English-language transition.

Read [current specification](.ai/specs/099-english-investment-workspace.md),
[architecture](docs/architecture.md) and [Git workflow](docs/git-workflow.md).
Older `.ai/context` notes and specifications are an archive of the original
collaborator's project. They may describe accounts and deployments that are no
longer the source of truth. Do not act on archived account identifiers.

## Environments and authorization

- Repository: `vnara19/my-portifolio`.
- `dev`: Vercel Preview and Neon `development`.
- `main`: Vercel Production and Neon `production`.
- Implement, verify, commit and push requested changes on `dev`.
- Require explicit approval before publishing a reviewed change to `main` or
  applying production migrations. Approval for a Preview does not approve release.
- Store credentials only in ignored local files or service secrets. Never print,
  version or upload `.env`, auth tokens or personal financial backups.
- Browser/integration tests that write must use an isolated test schema/database.

## Compatibility

English labels must not rename stored taxonomy values, API/provider field names,
backup format identifiers or existing routes without a separate migration plan.
Use `src/lib/english-labels.ts` at display boundaries. Preserve free-form names.
Recognize both English and legacy generated transaction-note markers.

Keep financial precision and BRL/USD currency semantics unchanged. Display English
number/date formatting while accepting legacy Brazilian decimal input. Market
rules and business-day calendars still follow the asset's country.

Do not edit historical SQL migrations or the source spreadsheet. Keep archived
history and authorship. Update current docs when implementation changes.

## Interface

Before changing UI, read [style guide](docs/style-guide.md). Reuse shared primitives,
metric cards, badges, filters and page controls. Preserve the dark theme, accessible
focus/hover/disabled states, mobile safe areas, zoom and reduced-motion support.
Use `tailwind-variants` for shared atomic variants. Do not add development narration,
roadmaps or implementation details to the product UI.

## Checks

Run `pnpm check`, relevant unit/browser tests and a production build. Verify actual
rendered behavior, including narrow mobile screens, before sending a Preview.
Changes to backup contracts require compatibility and restore validation.

Keep one root `CLAUDE.md`; use `AGENTS.md` for any future local instructions.

## Next.js

Read the relevant guides in `node_modules/next/dist/docs/` before changing framework
code. This repository uses Next.js 16; do not assume older APIs or conventions.
