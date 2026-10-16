# 107 — Market groups and European listings

## Scope

Complete the market grouping deferred in 106. Add actual European listing lookup,
classification and valuation using current public providers and issuer references.
Keep commits/deployment on dev; no production release, migration or broker trades.

## Behavior

- The Add position picker exposes US Market, Brazilian Market, European Market,
  Cryptocurrency, Tesouro Direto and Fixed Income. Individual legacy US/Brazilian
  stock/ETF options are hidden only in new-position creation.
- Ticker metadata identifies name, wrapper, exchange and trading currency. The
  European picker provides explicit reference listings; custom symbols require
  an exchange suffix. Never infer the broker's execution venue from a bare ticker.
- Equity ETFs, bond ETFs, commodities, money-market exposure and Brazilian FIIs
  can receive an automatic allocation when supported by verified metadata or an
  issuer reference. Unknown ETF exposure remains Unclassified. Never classify all
  ETF wrappers as equity or infer FII status from ticker suffix alone.
- New assets derive identity and classifications on the server from signed,
  user/month-bound ticker proofs. Existing records retain their names/classification.
- EUR and USD European listings use a dedicated quote route, converting prices
  to BRL for existing valuation rules. Historical EUR prices use historical FX.
  Reject unsupported currencies and changes in a stored listing's trading currency.
- Existing fiat, crypto, US/B3 chains, treasury and transaction semantics remain.
  No paid provider account or IBKR credential is added.

## Sources and coverage

Yahoo chart metadata and public prices use the existing provider infrastructure.
Source URLs accompany issuer reference entries in market-assets.ts. UBS/DWS
references cover selected equity UCITS listings; iShares references identify gold
and silver ETCs; Amundi identifies overnight-return exposure. Vanguard and It Now
references cover selected US/Brazilian stock and bond ETFs. These are public
instrument definitions, not imported personal portfolio holdings.

The reference set is intentionally explicit, not a claim of complete UCITS
coverage. Other exchange-qualified symbols may have quotes but no verified fund
exposure. Future provider metadata can extend this without another manual form.

## Validation

- ESLint, TypeScript, 76 unit tests and production build pass.
- Unit coverage includes stock versus ETF, FII, bond funds, incorrectly tagged
  gold/silver wrappers, unsupported currencies, signed metadata tampering, current
  EUR/USD European conversion/routing and historical EUR conversion.
- Live public lookups verified UETW.DE, XDWT.DE, EGLN.L, PPFD.SG and CSH2.PA in EUR,
  with nonzero BRL valuations and the expected exposures.
- Five paper positions were created in an isolated development schema through
  the application layer. Deliberately incorrect client names/allocations were
  overridden by signed metadata. A sixth paper position was saved through the
  actual browser form, then checked for quantity, currency, allocation, opening
  transaction and storage-account reuse. No personal portfolio data was changed.
- Verify final Preview on desktop/mobile and remove the temporary schema/account.
