# Overview reporting alignment

The Overview uses USD for historical bars and product breakdown values. Each historical point uses its own month-end exchange rate; missing rates leave gaps rather than zero values or conversion at today’s rate. Position values and history remain stored in BRL.

Product breakdowns reuse the Positions resolver, including ETF/security metadata and Brazilian debt products. Legacy cash records remain visible as Cash Account; they do not enable new cash registration. The reference strip contains Selic Rate and Positions only.

Cryptocurrency is the single visible crypto product and class label, including legacy Bitcoin, Altcoin and Stablecoin filter aliases. Asset names, tickers, provider identifiers, saved subtype keys and backup contracts are preserved. Currency breakdowns use valuation currencies instead of BTC/Altcoins as currencies.

USD gains now use exact exchange rates recorded on transactions before falling back to dated daily rates. Monthly approximations are not accepted as exact acquisition costs. Incomplete ledgers expose a concise reason rather than unexplained duplicate dashes. Previous-day gain and annualized yield remain unavailable until the required valuation coverage and calculation are implemented; these are not substituted with balance changes. Historical income remains in accounting.

Verification: type checking, lint, complete unit suite, production build and desktop/mobile Preview review. Read-only diagnosis of the existing October fixture found missing historical USD rates; no financial records were modified.
