# Performance methodology

## Money and reporting

Transaction execution price, quantity, commission and acquisition FX remain
unchanged. Canonical trade notes recover original precision only when their
quantity, price and rounded payment reconcile with the stored ledger. Otherwise
the stored values remain authoritative. Current FX never replaces acquisition FX.

Overview gains are calculated once in EUR, then expressed in USD at current FX,
as requested. Portfolio NAV remains the entire holdings value in USD/EUR/BRL.
Asset pages use the asset's native reporting currency. Monthly balance changes
in USD include the effects of changing FX and are distinct from the Overview's
EUR-reference return. No wallet or cash account is created.

Open gain equals value minus open principal, excluding acquisition commission.
Commission is realized expense once, including on open purchases. Sales remove
proportional average principal and use proceeds after commission. Total monetary
gain is realized plus unrealized, computed before final display rounding. The
realized percentage is realized result divided by recorded funded capital; it is
not a second TWR calculation. The unrealized percentage uses remaining principal.

## Daily time-weighted return

The portfolio holds daily ending values and dated investment transactions, not
intraday valuations immediately before every trade. Use one explicit daily
convention: inflows at the beginning, outflows at the end. For each day:

`factor = (ending NAV + gross outflows) / (previous NAV + gross inflows)`

Link the daily factors multiplicatively. Purchases include commission in funding;
sale/redemption proceeds are net of recorded fees. Paid income is an outflow
because it leaves the tracked holdings; capitalized income stays in valuation.
Same-day purchases and redemptions retain both gross sides, even with zero net
funding. The funded first day includes its actual change and fees. A first value
with no funding is a baseline, not an inferred purchase. A zero balance and later
re-entry do not manufacture a loss or reset historical performance.

Missing prices/FX, inconsistent gross/net funding, nonfinite inputs, negative
values, and duplicate or nonchronological observations invalidate the linked
return. Large legitimate purchases must not produce an impossible negative
pre-funding NAV. The chart and summary share this function and reference currency.

This convention is documented by the
[Portfolio Performance manual](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/).
It is a daily timing convention, not a claim of intraday measurement or identical
TradingView output. TradingView uses its own
[cash-flow periods](https://www.tradingview.com/support/solutions/43000756023-portfolio-summary-total-and-realized-gain/).

## XIRR and comparison

XIRR uses dated funding as negative cash flows, actual outward proceeds as positive
flows and ending NAV as the final receipt. Acquisition commission belongs to
funding once. Calendar days use a 365-day year; no CAGR of TWR is substituted.
Ambiguous roots are rejected. It does not require identical intermediate daily
valuations, only complete funding and ending value.

The benchmark is S&P 500 Total Return with reinvested distributions, converted
to EUR at each observation date before return calculation. Its initial quote is
the closing observation before the first funded day's return, matching the
portfolio boundary. Calendar windows default to All; a selected chart range
windows the cumulative series without changing its accounting reference.

Monthly asset returns use Modified Dietz with dated flow weights, not the
portfolio's daily TWR. Absolute balance changes include funding; investment
changes remove it. These quantities have different denominators and must not be
added or interpreted as interchangeable returns.

## Verification on 2026-11-01

A separate read-only replay parsed all 67 source CSV buys and rebuilt six holdings
through 2026-10-31 over 908 observations. It did not call the application's TWR
function. Independent TWR was 73.86076832097484%, versus 73.86076832097504% in the
application. No daily value or flow exceeded EUR 0.03 NAV / EUR 0.01 funding audit
tolerances. XIRR was 8.784809419033289%; independently evaluated NPV residual was
less than EUR 0.000001. The replay changed no financial records.

Historical selection excludes subsequent reporting months. Reconstructed daily
valuations take precedence over older stored monthly snapshots when complete;
monthly snapshots remain a fallback for holdings without daily coverage. Completed-month
Overview totals, gains and Positions use the same confirmed closing prices in a
read-only valuation projection; stored transactions and snapshots are not rewritten.

Two ambiguous Yahoo EUR closes on 2025-10-24 are excluded by exact fingerprint
(UETW.DE and EGLN.L). Their original records were preserved privately before
removing those public quote observations from development. The gold figure also
appears as the issuer's USD NAV, while the UETW figure repeats across differently
denominated listings without volume. An exact replacement EUR close was not
verified. Valuation uses the preceding valid observation with its actual date;
it does not invent a replacement close. Corrected provider observations are
accepted if they no longer match the rejected fingerprint. The official gold
listing and NAV reference is
[iShares Physical Gold ETC](https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund?siteEntryPassthrough=true).

Tests also exercise first-day fees, large inflows, gross same-day turnover, partial
sales, complete liquidation, re-entry, loss, average cost, native execution
precision, historical FX, missing data and an independently constructed
units/price path. Matching these calculations does not establish identical
TradingView source prices, FX fixes or cash-flow timing. No output is tuned to a
target return percentage.
