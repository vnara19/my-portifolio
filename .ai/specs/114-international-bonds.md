# International Bonds

Status: manual full-value tracking implemented on dev; user accepted dated manual prices.

## Scope

One International Bonds asset kind for directly held US and European debt, with
ETFs continuing to use market categories. Issuer country, security denomination,
trading venue and brokerage are independent attributes. Do not infer the legal
issuer country from the ISIN prefix or the investor's broker. Store the actual
issuing entity, which can differ from the parent company.

Product families: sovereign (including US Bills, Notes, Bonds, TIPS and FRNs),
corporate, agency, municipal, supranational, covered and securitized debt. This is
an inventory, not a claim that one generic accrual formula supports every family.
Savings bonds, perpetuals, callable/putable, convertible, amortizing, floating and
inflation-linked securities need their own validated terms and cash-flow engines.
Never expose a selectable family as fully supported before its valuation works.

## Minimal input model

Identity: ISIN or CUSIP, security name, actual issuer and country, product family,
denominated currency. Resolve identity from an entitled provider where possible;
keep provenance. Broker is already provided by the account selection.

Holding: settlement date, total face amount held (not a vague number of bonds),
executed clean price per 100 face, accrued interest paid and commission. A broker
all-in settlement amount may replace separate components only if its semantics are
explicit; never count accrued interest or fees twice. Payment FX is separate from
denominated currency when the broker converts EUR to buy a USD bond.

Terms: maturity, redemption amount per 100, coupon type/rate, frequency, coupon
schedule and day-count convention. Request only fields relevant to the selected
structure. A yield is not a coupon. Regular fixed coupons and zero-coupon bullet
bonds are the smallest dependable initial valuation engines. Irregular schedules,
index ratios, resets, calls and amortization cannot be guessed.

Market observations: price per 100, clean/dirty convention, timestamp, source,
quote type (bid/ask/mid/last), and currency. User prices must remain user-scoped.
Show the observation date; do not label a previous observation as today's price.

## Valuation and return

Market value is face held times clean price / 100 plus applicable accrued coupon,
with index ratios/principal factors where the instrument requires them. FX uses
the security currency, not broker location. Dirty quotes already include accrued
interest: do not add it again. Prices are observations, not derived from acquisition
yield or a generic government curve advertised as a market quotation.

Keep market price P&L, accrued coupon and paid coupons distinguishable. Total
return includes distributions, current value and acquisition cost including fees;
paid coupons must not also remain in accrued value. Coupon income is not a new
principal contribution. Coupon dates can use calendar-day accrual conventions;
never apply the Brazilian 252-business-day default to international bonds.

Yield to maturity requires the actual remaining cash flows and settlement price.
For callable instruments YTM alone does not represent the guaranteed outcome.
No early-sale net proceeds/tax simulator is requested. Tracking a quoted market
value does not promise an executable sale at that price. At maturity, actual cash
receipts determine realized return; do not fabricate receipt of principal/coupons.

## Price-source decision

The user accepted dated manual broker valuations. Four example ISINs were supplied.
Brazil and Ireland sovereign references were verified at SEC/NTMA/exchange sources.
No paid provider purchase or IBKR account connection is authorized implicitly.
No universal free US+Europe bond feed has been verified. Do not silently substitute
an ETF, a yield curve, an unverified web price or an arbitrary EUR listing.

## Integration requirements

Additive schema, typed validation, user ownership, server-side derived fixed-income
classification, original cost/FX, monthly carry, coupon accounting, market-history
observations, overview/gain integration and backward-compatible backup restore.
Use decimal arithmetic. Test premium/discount/zero coupon, clean vs dirty, coupons,
fees, EUR denomination with US issuer, FX conversion, stale/no quote, maturity,
odd coupons, unsupported structures and duplicate identity across accounts.
Render the actual form on narrow and desktop screens before publishing dev only.

## Primary references checked 2026-10-22

- https://www.treasurydirect.gov/marketable-securities/
- https://www.treasurydirect.gov/marketable-securities/tips/
- https://www.finra.org/investors/investing/investment-products/bonds
- https://www.interactivebrokers.com/docs/tws-api/contracts/bonds
- https://www.interactivebrokers.eu/campus/ibkr-api-page/trader-workstation-api/
- https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/securities/html/index.de.html
- https://api.finnhub.io/pricing-bonds-api-finra-trace

## Initial implementation boundary

The implemented form intentionally uses total acquisition money and full holding
market value rather than pretending a generic clean-price/coupon engine supports
all structures. USD and EUR are supported. Conditional forecasts, YTM and automatic
prices are not delivered. These remain separate implementation work from accurate
manual marked holdings, actual coupon receipts and principal repayments.
