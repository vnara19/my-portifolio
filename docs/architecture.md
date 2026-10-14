# Architecture and behavior

## Runtime

Next.js App Router, React and TypeScript provide the application. Prisma with the
PostgreSQL driver adapter connects to Neon. Better Auth stores users, credentials,
sessions and rate limits in PostgreSQL. Registration is restricted by an email
allowlist. The interface is English and dark-only.

Vercel hosts the application. GitHub stores source and triggers deployments:
`dev` → Preview → Neon `development`; `main` → Production → Neon `production`.
Production releases require user approval. Provider jobs run in GitHub Actions.
No credential or service owned by the original collaborator is required.

## Product boundaries

The product is investment-only: Overview, Positions, Quotes and Settings. Removed
family, payroll and standalone pension screens/routes are not exposed. Their
historical database tables and data remain untouched. A pension asset may remain
part of the investment portfolio. Salary tracking and a TradingView-inspired
redesign require separate specifications.

## User data

All portfolio reads and writes pass through user-scoped database access. Public
provider quotes are shared by symbol; a manual quote is user-specific. Editing
requires an open reporting month. Liquidating a position records a full withdrawal
and preserves history; deleting a record has a different meaning.

Keep legacy classification keys and backup IDs stable. `englishLabel` translates
built-in display labels without changing stored categories. API field names,
route/query keys and official CSV headers are contracts, not interface copy.

## Precision and calculations

Use decimal arithmetic for investment valuation and integer cents where required.
Use an average-cost basis for withdrawals and realized returns. Internal transfers
do not count as fresh capital. Automatic accrual uses CDI or annual fixed rates,
252 business days and the Brazilian holiday calendar. Preserve known balances when
rates are incomplete. English formatting does not change currency or market rules.

## Updates

Navigation reads database prices; it does not fetch every provider. The job uses a
PostgreSQL execution lock, fetches due symbols and retries failures with backoff.
Current quotes become due after 50 minutes. Historical failures retry after one day.
Selic is informational and does not directly reprice positions. CDI data feeds
eligible automatic-accrual positions. UI update age refers to a successful quote
write relevant to that user's symbols.

## Backups

Restore validates input, summarizes it, then applies a user-scoped transactional
replacement. Existing version-5 exports remain compatible. Financial backups are
local/private data and never source-controlled. Export a new backup before risky
production data changes.

## Reporting currencies

Overview reports USD as the primary currency with EUR and BRL equivalents. The
three change cards compare each endpoint in its own currency; their percentage
and direction reflect USD. Cash flows, asset valuation and FX all affect balance
change. Existing portfolio valuation and storage remain BRL.

The quote job always includes USD/EUR when a reporting month exists. EUR uses daily
ECB reference data via Frankfurter (no API key), with Yahoo fallback. Missing
month-end FX is backfilled; current rates must never stand in for historical rates.
Existing non-carried and manual monthly observations take precedence. Bitcoin's
USD display uses the stored BTC/BRL and USD/BRL quotes for the selected month.
