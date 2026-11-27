# Open European ticker search

European Market uses one Ticker input. Bare tickers search Yahoo Finance's public
catalog, with matching European listings shown by symbol, exchange and fund name.
Choosing a result verifies its quote, trading currency and instrument identity
through the existing signed proof flow. Exchange-qualified tickers work directly.
No position can be saved from an unverified search result.

Issuer reference examples remain classification data, never an allowed-assets list.
Provider catalog coverage is not guaranteed to include every European instrument.
Only the existing EUR, USD and BRL trading currencies can currently be saved.
Unknown ETF exposures remain Unclassified rather than being guessed as equities.
