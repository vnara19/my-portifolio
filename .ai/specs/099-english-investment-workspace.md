# 099 — English investment workspace

Requested by Victor on 2026-10-14. Implementation targets `dev`/Preview; production
release requires separate explicit approval.

## Accepted scope

- English interface, validation, generated notices, current comments/docs and future commits.
- Preserve official names: Tesouro Direto, Selic, CDI, IPCA and tickers.
- Overview, Positions/Quotes and Settings without the area sidebar.
- Retire family expenses, income/payroll, overtime and standalone pension screens/routes.
- Preserve historical database tables, data, applied migrations and commit authorship.
- Preserve legacy taxonomy, provider/API fields, routes and backup format contracts;
  translate at presentation boundaries and accept old generated transaction notes.
- Keep historical `.ai` notes/specs and source spreadsheet/VBA in their original language,
  as explicitly confirmed by the user. No external translation service.

## Deferred

Salary/deposit tracking and a TradingView-inspired portfolio redesign are future requests.
This change does not alter valuation formulas, market rules, currencies or account ownership.

## Acceptance

Lint/type checks, relevant unit tests and production build pass. Existing version-5
backup and automatic-accrual/liquidation markers remain compatible. English numeric
input works alongside legacy Brazilian input. Verify Preview on desktop and mobile;
removed routes no longer expose their legacy pages/APIs. Do not publish to `main` yet.

## Validation completed

- ESLint and TypeScript checks pass; 53 unit tests pass.
- Production build passes with Webpack. Removed pages and APIs are absent from the route list.
- Database schema semantics and historical migrations are unchanged.
- A version-5 backup was exported, previewed and restored in an isolated development schema;
  position values and legacy classification keys were preserved.
- The existing in-app browser verified login, navigation, asset-type choices, positions,
  overview and settings with fictitious data. The mobile overview has no horizontal overflow.
- The full Playwright suite was not executed because installing a separate browser was declined.
  No personal portfolio data was used for writes during verification.
- The quote workflow translation is deferred: the existing GitHub OAuth authorization
  lacks the workflow scope. The workflow is unchanged in this commit, and its proposed
  English patch is kept outside the repository. Production scheduling remains unchanged.
