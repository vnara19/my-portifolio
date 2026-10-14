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

## Portfolio presentation

Settings exposes the tolerance band, imported backup versions, backup tools and account controls. Saving it updates only the active plan's
tolerance, without validating or modifying hidden allocation weights. Existing
classification, strategy and target data remain compatible with stored backups.
Overview allocation always uses the overall portfolio and offers only Class and Currency views; it shows current holdings only.
Target charts and buy/sell recommendations are not displayed. No target plans are
created just by visiting Settings.

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

Overview reports USD as the primary currency with EUR and BRL equivalents only
in the portfolio-value card. The other cards show unrealized gain, realized gain
and total gain in USD. Gains use average acquisition cost converted at each
transaction's historical USD rate, including FX effects. Opening balances define
the recorded cost baseline, not an inferred original purchase price. Contributions
increase cost rather than profit; partial sales remove proportional average cost.
Paid generic income is realized; capitalized income remains in holding value.

Incomplete transaction quantities, missing historical FX and transfers without
carried acquisition cost make gain metrics unavailable rather than estimated.
Last-day gain, separately identified dividends, TWR and XIRR currently display
an unavailable indicator with an explanation. Balance changes remain available
internally and must not be mislabeled as investment performance. The month selector
and existing charts are unchanged. Storage and existing position valuation remain BRL.

The quote job always includes USD/EUR when a reporting month exists. EUR uses daily
ECB reference data via Frankfurter (no API key), with Yahoo fallback. Missing
month-end FX is backfilled; current rates must never stand in for historical rates.
Existing non-carried and manual monthly observations take precedence.

The overview information strip displays USD/BRL, EUR exchange rates, Bitcoin in USD, Selic, position and institution counts.
