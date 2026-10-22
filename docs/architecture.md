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

Functions deploy to `gru1` (São Paulo), alongside the current Neon database in
AWS `sa-east-1`. Keep compute near the database to avoid an intercontinental
round trip for every query. Moving the database to Europe is a separate migration,
not necessary to improve navigation against the existing database.

Dynamic routes have lightweight, prefetchable loading shells. Quote-refresh
status streams independently so its audit queries cannot block the page content.
Independent overview reads run concurrently, and the Positions editing catalog
starts alongside month selection. No cross-request cache of private portfolio
data is introduced; session verification and user scoping remain unchanged.

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

The overview information strip displays USD/BRL, EUR exchange rates, Bitcoin in USD, Selic and the position count.

## Position creation

Add position uses one scrollable form, with Asset/Cash selection and direct saving.
Relevant ticker, name, quantity/balance, currency, maturity, liquidity and allocation
fields retain their validation and quote verification. There is no separate review
step. New positions do not ask for institution or strategy: they use a user-scoped
Portfolio/Main storage account and no strategy. Existing accounts and historical
positions are unchanged. Cash here records a holding balance; external cash flows,
salary tracking, fees and a new trade ledger are not introduced by this UI change.
The overview information strip no longer displays an institution count.

New-position creation no longer exposes manual allocation controls. Existing
catalog classifications are retained; cryptocurrency, cash and explicitly selected
stocks receive their known default class. ETF wrappers do not imply equity
exposure: without verified fund metadata, a new ETF remains unclassified. New
positions can therefore have no allocation rows, while manual edits retain their
existing validation. No existing positions are reclassified by this UI change.
Quoted assets use the existing catalog identity, provider name when available, or
the verified ticker as a fallback; manual names remain for private balances. Tesouro Direto names come from the
official security catalog.

## Market listings and European assets

New quoted positions select US Market, Brazilian Market or European Market rather
than choosing stock versus ETF in advance. Legacy kind keys remain valid. Yahoo
instrument metadata identifies stocks/ETFs, trading currency, name and exchange.
Issuer-backed public listing references supplement exposure data for supported
funds; an ETF wrapper alone never implies equity exposure. Brazilian FII legal
product names can identify real-estate funds; a ticker ending in 11 is insufficient.
Unknown fund exposure remains Unclassified. Issuer references override erroneous
wrapper metadata (for example a physical-gold ETC reported as EQUITY).

European listings retain exchange-qualified symbols. The picker offers verified
reference listings, with manual entry for other supported exchanges. It does not
guess where a broker executed a trade. Trading currency comes from the actual
listing, independently of the fund's base currency. EUR/USD/BRL observations are
converted to BRL before valuation; GBP/GBX and unknown currencies are rejected.
European quote types use an EU_ prefix to keep both EUR and USD European listings
on their Yahoo route, separate from the US Finnhub and B3 chains. Historical EUR
quotes use historical FX, never a current rate or an unconverted EUR amount.

Identity, currency, wrapper and exposure are included in user/month-bound signed
ticker proofs. The server uses verified names/types/currencies and reconstructs
new-position allocations from those claims. A client cannot relabel the metadata.
Existing monthly/manual quotes remain authoritative for that month's valuation;
existing portfolio records are not bulk-renamed or reclassified. Public listing
lookups have a short bounded cache; private portfolio responses are not shared.
The legacy Reserva taxonomy key is displayed as Commodities without rewriting data.
No new subscription or broker credentials are needed for this integration. Yahoo
availability and reference coverage are limited; complete worldwide UCITS metadata
is not guaranteed.

European Market now searches the provider catalog from a single ticker field.
Search candidates are not trusted quote identities: selecting an exchange-qualified
symbol invokes the existing quote verification and signed save proof. The issuer
reference catalog supports classification only and does not restrict search results.

European bare-ticker resolution now verifies each candidate's actual trading currency
and prefers matching EUR products on Xetra, then Paris/Amsterdam/Milan. Ambiguous
major-venue products remain explicit choices with currency shown; exchange-qualified
symbols remain an override. See spec 109 for bounded public metadata caching, venue
preference and reviewed issuer sources. Description-based fund classification augments
issuer references conservatively. New market positions with unknown exposure are
rejected before writes; client allocations cannot bypass signed classification.

Market purchase entry (spec 110) uses native-currency execution price, fractional
quantity, commission and acquisition date. The write boundary validates currency,
obtains dated FX before the transaction and records fee-inclusive acquisition cost
in existing PositionTransaction.amountBrl, with native breakdown in note. Current
position value excludes fees. The average-cost gain ledger, Overview allocations,
undo and backup v5 consume/preserve the existing fields; no migration is required.

Market trade entry (spec 112) adds Buy/Sell to the same single-page form for US,
Brazilian and European listed assets and cryptocurrency. Additional buys append to
an existing holding; sales use WITHDRAWAL and net proceeds after commission. The
USD average-cost ledger releases proportional acquisition basis into realized gain
and retains remaining basis for unrealized gain. Full sales preserve history.
Sales cannot precede ownership or exceed units held on their execution date. Month
edits are serialized per user/month to prevent concurrent overselling. Cash balances
are not automatically credited by this recording operation. Historical holdings in
a single non-default account can be resolved unambiguously; multiple-account
holdings require selecting the corresponding position. Backup v5 remains unchanged.

Cash creation supports BRL, USD and EUR through a name and native-currency balance.
Cash has no new maturity, accrual setup, redundant currency field or trade side.
Foreign cash stores native units with a dated FIAT/BRL quote; missing monthly USD
or EUR reference rates are fetched before the write transaction. New cash receives
Cash allocation on the server. The new eur-balance type is additive; existing keys,
SQL migrations, historical records and backup v5 remain unchanged. Switching entry
type, market or cash currency clears lower fields and invalidates pending ticker
verification. Re-selecting the active option preserves entered values.


## Tesouro Direto acquisitions

The authenticated catalog and current quote checks use the compact official
`/o/c/rentabilidades/` snapshot, with a five-minute cache and concurrent request
sharing. Historical backfills retain the official Tesouro Transparente CSV.
The catalog includes outstanding securities outside the current offer, marked
Existing holdings only. Security IDs still use the exact official type and final
maturity date; RendA+ target years identify the start of income, not final maturity.
Current portfolio valuation uses the official gross redemption price.

The purchase form captures original date, units in increments of 0.01, unit
acquisition price, contracted annual rate and costs paid at acquisition. An optional
statement principal preserves rounding differences from unit prices shown with two
decimals; mismatches outside that rounding tolerance fail. BRL and fixed-income
classification are automatic. Separate historical purchases become dated ledger
entries, retaining their rate/indexer and native cost breakdown in transaction notes
through backup, restore and undo. Acquisition costs feed the existing gains model;
current market prices never replace original purchase cost.

Public data does not expose a customer's tax basis, accrued custody fees or exact
net redemption. This change does not add an IR/IOF/custody estimator or a projected
IPCA/Selic cash-flow model, nor does it infer guaranteed future indexed returns.


Treasury acquisition inputs are manual: purchase date, titles purchased, price per
title and contracted yield. New form submissions use quantity × unit price,
zero purchase commission and no principal override. Historical acquisition fees
and exact-principal adjustments remain supported by the ledger and backups. The form has no public-offer autofill or explanatory paragraphs below inputs.
Official prices still power portfolio valuation and the security catalog; they never
replace the personal acquisition data. Yield labels distinguish IPCA/IGP-M and Selic
spreads from fixed annual yields. Official indexer display labels normalize Prefixado,
Selic and acronyms without changing provider values or stored security identities.


## Brazilian bank deposits

Brazilian Fixed Income covers CDB, LCI and LCA with principal and interest paid at
maturity, in BRL. Product, issuer, invested principal, purchase/maturity dates,
rate and redemption are explicit. New contracts use 252 Brazilian business days;
legacy 365-calendar-day terms remain readable without rewriting saved contracts. It generates a
lot-specific asset name, automatic fixed-income allocation and dated original cost.
A nullable fixedIncomeContract JSON column preserves the terms through backups.
No CRI/CRA coupon, amortization, bank-account connection or net-redemption tax
calculator is implied by this form. US/European direct bonds remain separate work.

CDI uses observed BCB SGS 12 daily rates. New fixed and IPCA contracts use 252
Brazilian business days and stop at maturity. IPCA balances stop all accrual,
including the real-yield component, after the latest published SGS 433 month.
Published monthly inflation is allocated across Brazilian business days within
that month, multiplied by the contracted real-yield factor. Weekends and holidays
add no factor for business-day contracts. Saved legacy calendar-day contracts keep
their recorded convention. This is a gross reference calculation, not confirmation
of an issuer-specific anniversary/lag calculation or a bank redemption quote.
Gaps inside observed inflation coverage fail without replacing the known balance.
Contract holdings are recalculated from original dated cash movements across
reporting months so late inflation releases are not permanently lost at rollover.
The income panel shows the last accrual date and published inflation reference.
The automatic quote job refreshes both rate series.

The asynchronous open check also refreshes the signed-in user's structured bank
deposits, reusing the three-hour shared rate cache, and refreshes the view only when
balances/errors change. It does not run a full market quote sync or block page
navigation. Scheduled rate jobs still perform portfolio-wide refreshes.

## International bonds

International Bonds combines direct sovereign, corporate, agency, municipal,
supranational, negotiable CD, covered and securitized holdings. Issuer country and
USD/EUR denomination are independent. ETFs remain in their market categories.
The manual form accepts any checksum-valid ISIN/CUSIP, not just reference examples.
Issuer metadata is manual except the Brazil 2037 and Ireland 2037 public references.
It does not claim to verify arbitrary issuer terms or provide an automatic price feed.

Tagged international-bond metadata shares the existing nullable fixedIncomeContract
JSON column. Brazilian contract readers reject this separate shape. No database
migration or backup-version change is required. Acquisition lots preserve face
amount, actual settlement date and the total paid in the bond denomination, including
fees and accrued interest. ECB reference FX converts reporting values; a broker's
EUR payment conversion is not a change in the bond denomination.

Manual observations are full monetary holding values including accrued interest and
any principal/index factor, not clean prices per 100. They are dated and user-scoped;
no daily market price or yield is invented. The current open month refreshes FX on
the existing asynchronous open check while retaining the native quote's date.
A new acquisition is not daily compounded using the Brazilian deposit engine.

The bond panel records actual coupon receipts separately from principal repayments,
atomically with the post-payment full holding valuation. Coupons have zero quantity
and count as realized income after recovering any interest paid at acquisition.
The form records that prepaid interest separately within the total paid, and the
gains engine removes the recovered portion from acquisition cost exactly once.
Principal repayments remove face quantity and average
acquisition cost; a full redemption requires zero remaining valuation. Repeated
cash receipts on the same holding/date are rejected. Cash receipts do not fabricate
a matching cash-account deposit or automatic reinvestment. Generic balance edits,
transactions and liquidation are blocked for bonds to preserve native face semantics.

Current totals and overview fixed-income allocation use the latest saved full
valuation. Gains use the original acquisition FX and recorded actual receipts.
Expected coupon schedules, yield to maturity, projected floating/indexed cash flows,
automatic broker access and early-sale proceeds are not implemented. These require
verified instrument terms and/or a separately entitled market feed.
