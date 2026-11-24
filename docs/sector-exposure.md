# Sector distribution

The experimental Sectors view uses GICS's eleven company sectors and explicit
non-GICS buckets for gold, government bonds, money market, cryptocurrency and cash.
It distributes existing USD holding values; it does not change valuations, costs,
returns or transactions. Sector gain attribution is omitted because holdings
weights alone cannot establish each sector's contribution to fund returns.

Reviewed sources and links live in `domain/sector-exposure.ts` and are retained for review. The chart uses concise display names without GICS suffixes. UETW uses dated MSCI World index weights
as a fund proxy (March 31 and October 30, 2026), normalized for published rounding.
Only snapshots on or before the reporting day are eligible. Older unsupported
periods and unknown securities remain Sector unavailable. XDWT uses its technology
mandate; EGLN uses physical gold; CSH2 uses its economic overnight-rate exposure,
not synthetic collateral sectors. Bank debt and reviewed Morgan Stanley bonds
use the issuer's Financials sector rather than loan-book look-through.

These are reviewed reference snapshots, not an automated holdings feed. Price
refreshes do not refresh sector weights. Additional securities require reliable
issuer/index source coverage before their sector exposure can be displayed.

The UI omits explanatory prose at the user's request. Reference snapshots remain
dated; removing the disclosure does not introduce live sector refreshes.

## Automatic fund coverage

The current reporting day's Sectors tab requests public fund composition from
Yahoo Finance for ETF quote symbols, including newly added ETFs. The authenticated,
same-origin route accepts a bounded symbol list, limits request size/rate/concurrency,
and never transmits balances, transactions, accounts or user identifiers upstream.
Provider sessions contain only provider-issued technical cookies and are never
logged, returned to clients or included in the persistent data cache.

Public results are cached in the Next Data Cache for 24 hours and revalidated on
demand. The tab rechecks hourly while visible and when opened. This does not slow
initial Overview rendering or change quote-update jobs. This is on-demand automatic
refresh, not a separate unattended sector schedule. Dates record retrieval time;
Yahoo does not provide a holdings publication date in this response. Public provider
coverage and availability are not guaranteed. There is no automated web search or
manual category guess for unsupported ETFs.

Reported equity-sector weights apply only to the reported equity allocation.
Cash, bonds and remaining exposure stay separate. Incomplete totals, duplicate or
unknown sectors, negative weights and invalid asset mixes are rejected. CSH2 retains
its reviewed economic overnight-rate classification, rather than looking through
synthetic collateral. Historic months never receive today's composition. Provider
failures preserve reviewed fallback classifications/index snapshots (or Sector
Unavailable for uncovered funds); automatic results over seven days old are not
applied. Sector labels map provider categories to common industry labels; this is
not a licensed GICS classification feed or an independently audited holdings record.

Provider-reported `otherPosition` is displayed as Other Exposures. It is not
Sector Unavailable: the latter is reserved for uncovered securities, unmapped
composition and genuinely missing allocation. Preferred shares and convertible
securities are also retained when explicitly supplied. Tiny floating-point
residuals do not create phantom unavailable rows. The public cache version was
advanced so existing cached compositions are reclassified on their next lookup.
