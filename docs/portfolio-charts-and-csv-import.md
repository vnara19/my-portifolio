# Portfolio charts and trade CSV import

## Chart views and periods

Overview opens in Value mode: a purple USD portfolio-value line with a fading area fill. Performance uses a teal portfolio line and a dashed grey S&P 500 total-return-index line. Monthly Value, Class and Currency retain the existing portfolio breakdowns. All charts start at All, including after a reload; supported periods are 1M, 3M, 6M, YTD, 1Y and All. The reference strip retains USD, EUR, Bitcoin, Selic Rate (percentage only) and Positions.

Performance uses daily time-weighted returns, linking subperiod returns after removing each day's external funding. Paid distributions leaving the tracked portfolio count as outflows rather than losses. Fully redeemed capital and later new contributions do not themselves create returns. The chart retains cumulative performance when a shorter display window is selected, rather than rebasing the displayed window to zero.

TradingView's documented Portfolio Change methodology is the reference: https://www.tradingview.com/support/solutions/43000756018-overview-portfolio-change/ . Results are not promised to match another platform numerically: this application tracks invested assets without a cash wallet, reports USD, and may use different listing closes and FX observations. Daily quotes are closing observations, not reconstructed intraday portfolio values. The S&P 500 benchmark is the total-return index with reinvested dividends (^SP500TR), fetched through the existing Yahoo provider, cached for an hour and aligned by observed dates. No substitute ETF or artificial benchmark values are used. Provider failure is visible.

Daily portfolio valuations require reconciling the dated unit ledger with saved monthly holdings. Missing prices, historical FX or transaction-date valuations invalidate linked performance rather than being interpolated. Month-end values remain available independently. Holdings without daily quote coverage can therefore have a value history but unavailable TWR. The engine is not Modified Dietz and does not treat deposits or withdrawals as returns.

## Import contract

The strict trade CSV reader recognizes Symbol, Side, Qty, Fill Price, Commission and Closing Time. Executed fills and commissions remain decimal strings and use the existing purchase-cost and purchase-note contract. Historical market closes never replace executed purchase prices. Original source time and row are retained in the note; accounting uses the source calendar date without guessing its timezone.

Cash funding rows are intentionally excluded when the user chooses direct investment entry. They do not become holdings or duplicate contributions. An explicit, verified listing/currency mapping is mandatory because this CSV format does not contain currency columns. Equivalent listing prices may differ from the execution venue; source trade prices remain unchanged.

A complete version-5 replacement file is compiled before writes. Missing coverage, invalid quantities/dates, unsupported operations and oversales fail before replacement. The account-scoped backup restore replaces only owned portfolio data atomically; authentication data is outside its contract. The administrator must verify the development endpoint, preserve a private recovery backup, validate in an isolated schema, reconcile final quantities and keep source files and generated backups outside version control. Verified public market history is separate from uploaded trade prices.

ETF is the requested interface group for European exchange-traded commodity wrappers; provider instrument metadata retains ETC and the underlying exposure remains Commodities. Retired Cash Account and Pension Plan filter options appear only while corresponding legacy holdings exist.

## Verification

Unit coverage includes cash-row exclusion, fractional fills, commissions, identical legitimate trades, malformed dates, trade/valuation separation, missing FX, oversales, TWR cash flows, full redemption/reinvestment, missing valuations and calendar boundaries. Integration validation restores into an isolated schema and checks assets, transactions, currencies, products, gain availability and transaction-date valuation coverage before the authorized account replacement. Desktop/mobile browser review checks view switching, shared periods, default All, restored quote badges and real holdings.

## Overview gain reconciliation and chart corrections

Commissions recorded in purchase notes are separated from the open acquisition basis and recognized as realized expenses immediately, including on open trades. Sale proceeds already include commission, so that fee is never subtracted twice. This presentation change leaves total gain unchanged. USD remains primary; independently calculated EUR gain amounts are shown below it for comparison. EUR results use historical EUR conversion rates and are not obtained by dividing the USD profit by today's exchange rate.

Annualized Yield is XIRR from dated external investment funding and ending value, rather than an annualization of the TWR percentage. The solver uses calendar days and rejects absent or ambiguous solutions. In this wallet-free model, purchases/redemptions define funding; prefunding cash deposits omitted from the source import are not reconstructed. TradingView documents XIRR separately at https://www.tradingview.com/support/solutions/43000756024-portfolio-summary-annualized-yield/ .

Last Day uses open-unit price changes, adjusts for units bought/sold that day and excludes commissions from unrealized daily gain. It requires actual prices and FX observations. Carried native quotes are revalued with the current observation's FX; an older BRL-converted quote is not simply divided by today's dollar rate. This prevents artificial FX returns on weekends or across different exchange calendars.

XAxis identities are complete ISO dates, not repeated day/month captions across years. Cursor, active dot and tooltip therefore resolve the same point. Redundant explanatory chart footers were removed. Currency breakdowns now group crypto holdings as Cryptocurrency, independently of their USD pricing currency; BRL appears when BRL exposure exists.
