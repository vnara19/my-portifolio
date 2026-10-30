# Quote synchronization

`syncQuotes` is exposed by `pnpm quotes:sync` and the manual GitHub Actions workflow
`.github/workflows/quote-sync.yml`. Its schedule is currently commented out.
The Neon job is an optional deployment configuration, not proof of an active scheduler.
Do not promise unattended hourly updates until the deployed scheduler has been verified.

Set the repository secret `PORTFOLIO_DATABASE_URL` to the pooled Neon **production**
connection with `sslmode=verify-full`. Optional provider secrets are
`COINGECKO_API_KEY`, `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `BRAPI_TOKEN` and
`AWESOME_API_KEY`. Secrets are not source files. Do not dispatch the production
workflow from a development branch to test financial writes; use a separate test
connection and isolated schema instead.

The job acquires a PostgreSQL lock. Concurrent invocations report busy rather than
writing twice. Idle invocations do not fetch already-current symbols. Prices become
due after 50 minutes; quote failures back off for 1, 2, 4 and at most 6 hours.
History failures retry after 24 hours. Selic checks occur at most once daily.

Provider chains:

- FX: ECB reference → AwesomeAPI → Banco Central PTAX → Yahoo Finance (EUR uses ECB → Yahoo).
- Crypto: CoinGecko → Coinbase → Yahoo Finance → Binance.
- US assets: Finnhub → Yahoo Finance → Alpha Vantage.
- B3: Yahoo Finance → brapi → Alpha Vantage.
- Tesouro Direto: official price dataset, exact security and maturity.

CDI rates feed automatic-accrual positions; the informational Selic target does not
reprice them. Per-symbol errors are reported and may coexist with successful writes.
A green workflow means the job succeeded overall, not necessarily every symbol.
The application's update age measures the latest successful quote write for the user.

`jobs/neon` remains an optional alternative entry point, not the current scheduler.
Do not link it to the collaborator's projects or deploy it without a separate request.

## Reporting FX

USD and EUR are registered automatically for reporting, independently of quoted
positions. EUR/BRL uses the daily ECB reference feed through Frankfurter, with
Yahoo fallback. This public source needs no API key. It is also a USD fallback.
The daily quote retains the source date. Historical month-end FX fills reporting
comparisons without overwriting existing genuine or user-specific monthly prices.
FX history coverage is checked by scheduled/manual maintenance, including holes before the last sync marker.

The EUR screen displays the reciprocal explicitly (`1 BRL = … EUR`). The stored
quote and manual input remain BRL per EUR. BTC's primary display is USD; its BRL
quote remains the valuation and editing contract.

## Quotes screen and Preview

Quotes is scoped to registered portfolio symbols (including retained history), manual quotes and USD/EUR reporting conversions, not the whole market. The selected month controls the displayed monthly quote snapshot and update history. BRL is the valuation reference, so no BRL/BRL provider quote is required.

Authenticated opening/visibility checks refresh due quotes for the user's current holdings plus USD/EUR reporting rates. The existing five-minute check throttle, 50-minute quote freshness threshold, PostgreSQL execution lock and provider failure backoff are retained. This mode skips full history, Selic and global CDI maintenance. Symbols are selected server-side through user-scoped access, never accepted from the browser. Public quote updates reprice current holdings through the established job; purchases and historical transaction values are untouched. A `quotesChanged` response refreshes the page even on its first check, except while the user is editing.

Opening checks work in Preview and Production while the application is open. They do not run with the site closed. Unattended refresh still requires a separately configured scheduler. Update History reports recorded attempts/results, not an inferred schedule. Header portfolio totals and Selic are intentionally absent from Quotes.
