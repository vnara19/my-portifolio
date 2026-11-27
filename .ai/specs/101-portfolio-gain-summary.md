# 101 — Compact portfolio gain summary

Requested by Victor on 2026-10-14. Target dev/Preview only.

## Scope

Keep the reporting-month controls and existing graphs. Compact the overview title
and show four responsive cards: Portfolio value, Unrealized gain, Realized gain,
and Total gain. Portfolio value has USD as primary with EUR and BRL equivalents;
the other three cards use USD only. Remove the informational quote strip.

Use average cost as explicitly selected by the user. Acquisition cost is converted
using historical USD rates; current valuation uses the selected reporting month's
USD rate. Include closed holdings in realized gains. Total gain is the signed sum
of realized and unrealized gains; contributions are not profits. Opening records
are the cost baseline for imported holdings, not invented original purchase costs.

The user approved unavailable indicators with explanations where data is missing.
Do not estimate missing historical FX/costs or interpret generic INCOME records as
dividends. Daily return, separately identified dividends, TWR percentage and XIRR
annualized return remain unavailable until suitable data exists. Internal transfers
require carried cost before they can contribute to a reliable portfolio result.

## Deferred

Salary tracking, daily valuations, dividend ingestion, FIFO, performance accounting,
line/bar/performance graph redesign and period buttons are outside this change.
Production requires a separate release approval.

## Validation

ESLint and TypeScript pass; all 67 unit tests pass. Production build passes.
An isolated Neon test schema verifies user-scoped USD average-cost results with
fictitious opening, purchase and partial-sale transactions. Existing browser checks
confirm one desktop row, readable mobile cards and no horizontal overflow.
The standalone Playwright suite was not run; no separate browser was installed.
No schema, historical migration, month controls or graph behavior changed.
