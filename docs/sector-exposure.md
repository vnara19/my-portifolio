# Sector distribution

The experimental Sectors view uses GICS's eleven company sectors and explicit
non-GICS buckets for gold, government bonds, money market, cryptocurrency and cash.
It distributes existing USD holding values; it does not change valuations, costs,
returns or transactions. Sector gain attribution is omitted because holdings
weights alone cannot establish each sector's contribution to fund returns.

Reviewed sources and links live in `domain/sector-exposure.ts` and appear in the
view's Sources & methodology disclosure. UETW uses dated MSCI World index weights
as a fund proxy (March 31 and October 30, 2026), normalized for published rounding.
Only snapshots on or before the reporting day are eligible. Older unsupported
periods and unknown securities remain Sector unavailable. XDWT uses its technology
mandate; EGLN uses physical gold; CSH2 uses its economic overnight-rate exposure,
not synthetic collateral sectors. Bank debt and reviewed Morgan Stanley bonds
use the issuer's Financials sector rather than loan-book look-through.

These are reviewed reference snapshots, not an automated holdings feed. Price
refreshes do not refresh sector weights. Additional securities require reliable
issuer/index source coverage before their sector exposure can be displayed.
