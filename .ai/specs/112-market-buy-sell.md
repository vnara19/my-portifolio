# 112 — Market buy and sell entry

Requested by Victor on 2026-10-19. Target: dev/Preview only.

- Add Buy/Sell to the single-page market position form for US Market, Brazilian
  Market, European Market and Cryptocurrency. Leave Tesouro Direto, private fixed
  income and Cash entry unchanged.
- Accept fractional units, native execution price, commission and execution date.
  Commission increases buy basis and reduces net sale proceeds. Historical FX
  feeds the existing USD average-cost realized/unrealized gain calculations.
- Additional buys update an existing holding rather than create duplicates.
  Sales require ownership and a nonnegative chronological quantity ledger.
  Partial sales retain proportional basis; full sales preserve transaction history.
- Server validates ownership, editable reporting month, currency, date, decimal
  precision and proceeds. Serialize month edits to prevent simultaneous overselling.
- Reuse CONTRIBUTION/WITHDRAWAL and native transaction notes: no schema migration
  or backup-format change. Existing undo and backup/restore preserve trades.
- Recording a sale does not execute a broker order or automatically credit Cash.

## Verification

Unit cases cover all four markets, fractional partial sales, full realized loss,
fees and invalid net proceeds. Isolated development integration covers additional
buys, partial/full sales, overselling, selling an unowned asset, undo and gain
preservation through backup/restore. Check the rendered Buy/Sell form on desktop
and narrow screens; run lint, TypeScript and a production build before Preview.

Validation completed: 99 unit tests pass. Isolated database checks passed for all
four markets, including fractional additional buys, partial/full sales, commission,
unowned assets, overselling, undo, USD realized gain and backup/restore. A temporary
official Neon WebSocket adapter was used outside the repository after this local
network stopped accepting direct PostgreSQL connections; application dependencies
and deployment database connections are unchanged.
