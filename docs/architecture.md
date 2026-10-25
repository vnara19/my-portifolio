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
provider quotes are shared by symbol; a manual quote is user-specific. Editing uses dated reporting months without manual month locks. Liquidating a position records a full withdrawal
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
An authenticated same-origin `/api/bonds/reference` lookup accepts checksum-valid
ISIN/CUSIP identifiers. OpenFIGI supplies instrument identification (not a presumed
legal issuer or terms parsed from ticker text); U.S. Treasury Fiscal Data supplies
confirmed sovereign terms by embedded/entered Treasury CUSIP. Queries run in
parallel with bounded timeouts and an in-memory TTL cache. Additional live issuer
adapters read NTMA's current benchmark table, German Finance Agency factsheets
and the public ESM/EFSF transactions catalog. Every adapter matches the exact ISIN
inside its source before accepting terms. Country prefixes only select which source
to query; they never determine issuer country or currency. Shared catalog requests
are deduplicated and cached for one hour; failed requests are cached for 30 seconds.
Reads are capped at 2 MB and 6.5 seconds. No login, disclaimer acceptance, blocked
endpoint bypass or paid subscription is used.

Reviewed issuer/regulator references supplement Brazil 2037, Ireland 2037,
Citigroup 2028, the French 0% OAT 2032, Italian BTP 2051 and Spanish government
2028. Their existing source links distinguish these stored references from live
issuer adapters. Irish and Brazilian coupon schedules now supplement the prior
partial references. Reference anchors are rolled along the confirmed contractual
schedule rather than frozen in a past year. The French and Spanish live endpoints
returned 403/500 during integration; the reviewed records do not pretend those
services are connected. No universal corporate security-master coverage is claimed.

NTMA parsing excludes amortising/retired/floating tables. German parsing isolates
contractual table keys from unrelated price-history tables, verifies the government
issuer/currency and recognizes explicitly stated zero coupons. Neither minimum
trade size nor denominations dependent on a broker's unit convention are filled.
ESM/EFSF country and coupon frequency remain manual when absent. Conflicting
reopening rows are rejected. No personal purchase terms are fetched or inferred. No purchase amounts, dates or receipt interest are sent to providers.
ESMA queries returned HTTP 502 during verification and are not presented as an
operational provider. Paid services are not enabled. No universal free security
master or complete coupon-calendar coverage is claimed.

Only empty, untouched fields are auto-filled; identifier changes abort old lookups
and reset the prior instrument. Conflicting provider terms are left manual. Each
lookup reports source links and partial/unavailable results without blocking manual
entry. Neither ISIN prefixes nor auction prices/minimum bids are used to infer
issuer country, personal purchase cost or face value per bond.

All position categories show live required/complete field indicators and a compact
footer with outstanding fields. Add is disabled while validation is incomplete;
server validation remains authoritative. Bond entry validation shares the contract
schema, checks monetary relationships and regular coupon schedules, and requires
the existing regular-coupon fields for Fixed Coupon entries. Other structures keep
manual receipts. Blank selectors do not imply USD/corporate/fixed terms for an
unknown identifier. Date controls clear their underlying value on invalid partial
input, preventing an earlier valid date from silently keeping Add enabled.

Citigroup fixed-coupon terms are verified against
the SEC note (4.125%, semi-annual, 30/360 US, maturity 2028-07-25).
It does not claim to verify arbitrary issuer terms or provide an automatic price feed.

Tagged international-bond metadata shares the existing nullable fixedIncomeContract
JSON column. Brazilian contract readers reject this separate shape. No database
migration or backup-version change is required. Acquisition lots preserve face
amount, acquisition date (settlement date for legacy market records) and the total paid in the bond denomination, including
fees and accrued interest. ECB reference FX converts reporting values; a broker's
EUR payment conversion is not a change in the bond denomination.

Legacy market-tracked holdings retain their dated observations and receipt workflow.
New International Bonds entries use `valuationMode: Cost` with an empty quotation
array. The Current Price section is absent. Purchase Date is the actual acquisition
date (stored in the legacy `settlementDate` timeline key); no settlement date or
settlement-based purchase-interest calculation is inferred. Receipt interest is
entered per bond, except zero-coupon holdings which require no prepaid coupon.
The remaining form fields and regular coupon terms are unchanged.

For legacy market tracking, stored observations remain full monetary holding values including accrued interest
and any principal/index factor. Holdings accept fractional quantity and face value per bond. Legacy market-tracked
holdings accept dated price observations as before. Dirty prices already
include interest; clean prices add contractual 30/360 US accrual or explicitly
entered broker accrual. Total paid is the actual debit, including interest and fees.
New entries require maturity; legacy perpetual records remain readable. The source
is recorded internally without an IBKR default or a source input. Values are user-scoped;
no daily market price or yield is invented. The current open month refreshes FX on
the existing asynchronous open check while retaining the native quote's date.
A new acquisition is not daily compounded using the Brazilian deposit engine.

The bond panel records actual coupon receipts separately from principal repayments,
atomically with the post-payment full holding valuation. Coupons have zero quantity
and count as realized income after recovering any interest paid at acquisition.
The form records that prepaid interest separately within the total paid. The former
Interest Basis selector is replaced by purchase accrued interest per bond, in the
regular coupon section (or the purchase section for other structures). A value
entered from the purchase receipt is multiplied by fractional quantity before
storing total prepaid interest; it is not added again to the total paid. The same
field is not duplicated. New cost-tracked purchases use the actual receipt interest
rather than assuming Purchase Date is a settlement date. The
gains engine removes the recovered portion from acquisition cost exactly once.
Principal repayments remove face quantity and average
acquisition cost; a full redemption requires zero remaining valuation. Repeated
cash receipts on the same holding/date are rejected. Cash receipts do not fabricate
a matching cash-account deposit or automatic reinvestment. Generic balance edits,
transactions and liquidation are blocked for bonds to preserve native face semantics.

Current totals and overview fixed-income allocation use the latest saved full
valuation for legacy market holdings, or remaining acquisition cost for cost
holdings, converted with reporting FX. Gains use the original acquisition FX and
recorded actual receipts. Cost detail return includes actual coupon and principal
receipts; forecast coupons never enter recorded performance.
Optional regular fixed-coupon terms preserve annual rate, frequency, an anchor
coupon date and interest basis in the existing JSON contract. Contractual coupon
schedules, remaining principal and original gross gain to maturity are calculated
without reinvestment or taxes and assume full contractual payment. Scheduled dates
are not broker credit dates and do not insert cash receipts. 30/360 US accrual is
available only from verified reference terms in new entries; other bases require
broker accrued interest. Existing stored contracts retain their original basis.
Irregular schedules and non-fixed structures do not use this calculator. Price
observations are never rolled forward with accrued interest to invent a current
market price. Legacy backups without the optional terms still restore.
Yield to maturity, projected floating/indexed cash flows, automatic broker access
and early-sale proceeds are not implemented. A new live price feed requires verified
ISIN coverage and access; no subscription or broker connection has been created.

Cost tracking carries the actual native acquisition cost, with daily reporting FX,
and is labeled At Cost in Positions and Carrying Value at Cost in details. It never
inserts a market quote, forecasts a market price or books scheduled coupons. Actual
receipts need only a date and the coupon/principal amounts, without a valuation.
Dated cost events reduce prepaid interest upon coupon reimbursement and reduce cost
and remaining prepaid interest proportionally upon principal repayment. This keeps
realized coupon profit separate from recovery of paid interest and avoids a false
unrealized gain. Historical as-of costs, subsequent months, Undo and JSON backups
retain these events. The cost-only mode is optional in the contract so prior market
records continue to parse and keep their original financial semantics.

Nominal-value enrichment also queries AFT (French nominal fixed-rate debt) and
CNMV (exact-ISIN conventional fixed bond rows with CFI DBFTFB). Values are accepted
only from explicit nominal fields; minimum subscriptions, principal increments,
issue balances and inflation-adjusted principal are not inferred as per-bond units.
These public sites can reject server requests (AFT 403, CNMV 500 during the audit);
reviewed exact-instrument references remain available independently. Brazil's 2037
reference uses the 2007 reopening prospectus with USD 1,000 denominations, rather
than the original 2006 USD 100,000 minimum. France FR0014007L00 uses EUR 1, and
Spain ES0000012B88 EUR 1,000. Other unknown units remain manual.

The bond identification line displays the confirmed issuer (otherwise a formatted
identification name) and one issuer reference link. OpenFIGI attribution remains in
the API result, without a generic homepage link in the form. New-position progress
shows only the remaining required-field count for every asset category.

Positions now uses the title Portfolio, a flat table and two-way header sorting
(no grouping mode). The active facets are Class, Subclass, Type, Currency, Maturity
and Liquidity; quick class chips read the same saved allocations generated by Add
position (including crypto). Institution and Strategy facets, columns, search terms
and grouping logic are removed. Old institution/strategy/group query parameters
are ignored, and obsolete sort IDs fall back to Total BRL descending.

New entries need no institution/account selection or institutional catalog payload.
The backend resolves an internal Portfolio/Main container when neither accountId
nor newAccount is supplied. Repeated entries reuse it; Undo tracks newly created
container records. Existing account IDs and legacy payloads remain supported for
historical transactions and backup compatibility; no historical account, balance
or identifier is migrated or erased. The positions read model no longer queries
or emits institution/account names. Editing retains stored strategy values without
exposing a strategy control. Institution names are removed from position detail
and edit surfaces as well.

Manual integration verification: scripts/test-portfolio-container.ts requires a
disposable english099_<hex> schema and a fictitious account. It checks default
container creation/reuse, legacy record preservation, read models and Undo.

The positions table displays Asset, Quantity, Value, Portfolio % (and Maturity on
wide screens), without calculated-field glyphs or separate taxonomy/USD columns.
Value is the full holding in the contract/listing currency. Crypto is valued in
USD while Quantity uses coin units; USD/EUR cash shows its recorded native balance
without repeating money in Quantity. Other native values use that same reporting
month's USD/BRL or EUR/BRL observation; missing FX leaves Value blank, never guesses
a rate. Cost-mode bonds use dated native acquisition cost directly. Totals, shares
and cross-currency Value sorting retain their common BRL basis. No quote or carrying
value is changed by this presentation.

Quantity shows security/coin units only. International-bond nominal balances are
divided by confirmed faceValuePerBond; without that term the count is unknown.
Legacy balance-only Tesouro, fixed-income and pension positions keep no invented
unit count. Classification details remain available under the row's disclosure:
Class and Subclass show saved allocations, Asset Type maps legacy ETF/stock types
to the same market categories used in Add position. Stored taxonomy/backup keys
are unchanged. Cryptocurrency is the English display label for Cripto and crypto.
Currency facets now use the monetary Value currency, rather than BTC/Altcoins units.

Reporting months are now automatic calendar snapshots. Navigating the workspace
ensures the current month exists; the first visit after a month boundary carries
holdings forward without a confirmation dialog or close/open buttons. Legacy
DRAFT/REVIEWED statuses stay in backups and are managed automatically (current
month DRAFT, previous months REVIEWED), but no longer block dated edits.

Add position routes market trades by occurredOn, Brazilian fixed income by appliedOn
and international bonds by settlementDate, irrespective of the selected reporting
month. Entries without a purchase date use today. Missing intervening months are
created; earlier snapshots are not overwritten. Verification tokens remain scoped
to the page where they were issued, independently of the purchase destination.
When historical market observations are absent, the actual execution price is the
known carried observation; a present-day quote is never used as a historical price.
Existing later prices and transactions are preserved while quantity changes carry
forward. Fixed-income contracts recalculate using their dated principal ledger;
bonds retain native cost/valuation semantics and their own currency FX.

Dated adds and background income/bond updates share a per-user portfolio edit lock.
Undo includes the affected later snapshots and refuses to overwrite intervening
changes. Automatically created calendar frames remain, while the financial changes
and unused new entities are restored. The isolated integration script
scripts/test-dated-months.ts verifies routing, missing months, later ledgers/prices,
verification scopes, multi-month Undo and first-day rollover. Additional isolated
checks cover backdated fixed-rate accrual, EUR bond propagation, negative-balance
rollback and backup export/restore.

### Position classification filters

Positions separate Asset Class (saved exposure allocations), Asset Type (product),
Market (listing region), and Currency. Subclass remains in historical allocations
and backups but is no longer a top-level position filter. Product types use stored
contract terms or verified listing metadata; missing product metadata prompts Review Product Type on the holding rather than inventing a product. Cash Account is one product, independent of BRL/USD/EUR. Listing regions do not describe an ETF's underlying exposure, and the user-selected reporting convention assigns accounts to their currency region,
bonds to their issuer country, and cryptocurrencies to Global. Market therefore
represents reporting geography for these holdings, not their trading venue.
Market and Currency always include the supported regions and BRL/USD/EUR, even
when the selected portfolio has no matching holding. The Asset Type filter is deliberately limited to the agreed registration categories:
Stock, REIT/FII, ETF, CDB, LCI, LCA, Bonds, Tesouro Direto, Cash Account,
Pension Plan, Bitcoin, Altcoin, and Stablecoin. All bond families remain stored in
the bond contract but share the Bonds filter. REIT/FII is one filter category;
underlying instrument metadata remains unchanged. Unsupported products do not
appear as options, including through stale URLs or legacy metadata. Brazilian
private-debt registration and its filter share BRAZILIAN_DEBT_PRODUCTS (CDB/LCI/LCA).
Crypto categories follow the saved registration allocation, including Stablecoin
for USDC/USDT; legacy balance holdings explicitly allocated as Stablecoin retain
that product label without rewriting historical quantities or allocations.
Legacy CDB/LCI/LCA identity can be confirmed in Edit position. displayProduct is
retained alongside existing JSON contract fields and included in backups and
Undo; it does not create or alter contractual rates or valuation formulas. A
contracted product cannot be relabeled as a different product.
The Add position form shows the same derived product and listing market alongside
its exposure class. Existing stored taxonomy keys remain unchanged.
