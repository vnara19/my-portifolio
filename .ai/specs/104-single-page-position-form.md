# 104 — Single-page position creation

Victor requested removing the overview institution count and replacing the four-step
Add position wizard with one form. Remove Strategy and Institution from creation;
retain asset type, ticker verification, name, quantity/balance, currency, maturity,
liquidity, allocation and automatic-accrual rules. Save directly without review.

One Add position button opens an Asset/Cash choice. Existing BRL/USD cash types are
supported; this does not add salary tracking, external cash-flow accounting, fees,
EUR cash storage or a new trade ledger. New holdings use a user-scoped Portfolio/Main
account for storage compatibility. Existing accounts, identities, edits and history
are preserved. Keep edit-mode sections unchanged.

Target dev/Preview. Production requires separate approval.

## Validation

ESLint and TypeScript pass; all 67 unit tests pass. Production build passes.
Browser checks in an isolated schema created a BRL cash holding and a Bitcoin
holding directly from the same form. BTC was verified by the existing provider
flow; quantities, valuation, opening transactions, absent strategy and reuse of
the same storage account were checked. Required-field validation, mobile width
and fixed-income fields were also checked. No personal data was modified.
The standalone Playwright suite was not executed and no browser was installed.
