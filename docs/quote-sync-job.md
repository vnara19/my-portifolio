# Quote synchronization

`syncQuotes` is exposed by `pnpm quotes:sync` and the GitHub Actions workflow
`.github/workflows/quote-sync.yml`. Current production scheduling is hourly at
minute 17, with `workflow_dispatch` for manual runs. GitHub may delay scheduled runs
and disables schedules in inactive public repositories; inspect Actions regularly.

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

- FX: AwesomeAPI → Banco Central PTAX → Yahoo Finance.
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
FX history coverage is checked daily, including holes before the last sync marker.

The EUR screen displays the reciprocal explicitly (`1 BRL = … EUR`). The stored
quote and manual input remain BRL per EUR. BTC's primary display is USD; its BRL
quote remains the valuation and editing contract.
