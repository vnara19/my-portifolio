# 106 — Simplified position classification

## Implemented scope

- Selected Asset/Cash uses the primary green button variant.
- Asset-kind picker uses title-case labels and Cryptocurrency.
- Market/crypto position names come from catalog/provider identity with ticker
  fallback, without a manual name input.
- Remove manual allocation controls from new positions; retain legacy editing.
- Preserve known catalog allocations, classify cryptocurrency/cash/explicit stock
  types, and leave new ETFs unclassified without exposure metadata. Do not infer
  equity, bond or commodity exposure from an ETF wrapper or product-name keywords.
- Permit an empty allocation list only on addition; editing validation is unchanged.
- No migration, bulk reclassification, quote refresh schedule or production change.

## Provider investigation and remaining scope

EODHD Fundamentals documents global ETF identity and asset allocation fields.
Twelve Data documents international ETF coverage; a public catalog entry does not
establish availability under a particular account's free API plan. Verify actual
listing/ISIN, trading currency, fund mandate and subscription entitlements before
adding a provider or promising complete UCITS coverage. No account or subscription
has been created. Credentials must stay in ignored local/service secrets.

US/Brazilian grouping, European listings and BRL/USD/EUR trading-currency selection
remain pending that integration; the existing kind/provider/valuation contracts
must not be replaced with cosmetic market options that save incorrect quotes.
Fixed-income accrual setup and transaction price/commission/date remain deferred.

## Verification

70 unit tests pass, including unknown bond/commodity ETF exposure and deterministic
crypto/cash classification. Run lint, type checks and production build, then inspect
the actual Preview form on desktop/mobile without saving personal financial data.
