# 100 — USD reporting and EUR reference quotes

Requested by Victor on 2026-10-14. Implement on `dev`/Preview only.

## Scope

- Overview total: USD primary, EUR and BRL equivalents below it.
- Monthly, 12-month and all-time balance changes: USD percentage, with amounts in
  USD, EUR and BRL order. Use each endpoint's own exchange rate, including FX
  movement. Contributions and withdrawals affect the balance change; these cards
  do not represent time-weighted investment performance.
- Add EUR/BRL to scheduled quote registration even without an EUR position. USD is
  also required for portfolios consisting entirely of BRL assets.
- EUR badge and quote table explicitly show `1 BRL = … EUR`, plus the reverse rate.
- Bitcoin in the overview and the main quote-table value is shown in USD by
  converting the stored BTC/BRL price with the reporting month's USD/BRL rate.
- Keep BRL storage, investment calculations, position input and version-5 backups
  unchanged. Currency selection for new positions, salary entry, European policy
  rates and stock-market indices are later stages.

## Sources and history

Reuse the USD and crypto provider chains. Add an unauthenticated daily ECB reference
feed via Frankfurter for EUR, with Yahoo fallback. Frankfurter also provides USD
fallback and historical month-end FX. Daily reference data is not an intraday quote;
retain the observation date, including weekends. Do not rename existing symbols.

Backfill missing historical FX and replace carried FX with an actual observation.
Preserve existing non-carried monthly prices and user-specific manual quotes.
Existing daily FX closes can serve as a historical fallback when no monthly record
exists. Missing rates are shown as unavailable; never apply today's rate to a past
balance. Manual quote editing still accepts BRL per unit, including BTC and EUR.

## Validation

Unit tests cover FX-only changes, EUR appreciation, deposits, investment growth,
missing/invalid rates, zero baselines, pair/date validation and provider fallback.
Integration tests must run in an isolated test schema and verify automatic FX
registration, month-end backfill, preservation of an existing quote and actual
application reporting. Verify desktop/mobile cards and the quote table before
publishing a Preview. No production changes without explicit release approval.

## Completed checks

- 62 unit tests and the isolated reporting integration test passed.
- ESLint, TypeScript and a production build passed.
- Desktop and 390px mobile overview checked with fictitious data; no horizontal overflow.
- Quote table checked: EUR reciprocal and BTC in USD, with underlying BRL values retained.
- Live public USD/EUR/BTC requests succeeded without configured API keys.
- Development quote sync completed with nine symbols and no failures; EUR historical
  backfill saved 36 monthly observations. Production data and workflow were untouched.
- Existing schema, migrations and backup version were unchanged.
