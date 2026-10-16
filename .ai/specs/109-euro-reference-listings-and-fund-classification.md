# EUR reference listings and fund classification

Bare European tickers prefer a verified EUR reference listing. Search prioritizes
exact ticker matches and checks chart metadata for each venue's actual currency.
Fund denomination and exchange suffixes never substitute for currency verification.
Xetra is preferred, then Paris, Amsterdam and Milan. The policy is a deterministic
reference venue preference, not per-fund volume ranking or the broker execution venue.
Major EUR listings must have matching names (or sufficiently long matching truncated
prefixes). Different major EUR products remain choices; non-EUR-only results also
remain choices and display verified currency. Unsupported currencies cannot be chosen.
Qualified tickers remain an explicit override and are verified as before.

Public search/metadata results are cached for 60 seconds, bounded to 250 entries.
At most eight candidates are checked, four concurrently, with five-second quote
timeouts. Search is not a complete global instrument database or live liquidity feed.

Classification first uses reviewed issuer references. Additional conservative rules
recognize explicit bond, physical-metal, overnight/money-market or equity mandates,
and recognized equity benchmarks in provider fund names. This is local description
inference, not a claim that Yahoo supplies complete structured fund classifications.
Mixed portfolios, convertible/option products and unrecognized descriptions stay
unknown. Merely being an ETF never means equities. Full issuer references cover
EXUS.DE, VUAA.DE, XMEU.DE/MU, V50A.DE and VWCE.DE in addition to previous examples.

Unknown classifications block new market position creation in both UI and server,
even if the client supplies an equity allocation. Existing positions/history are not
rewritten. No production data or migrations are involved.

## Reviewed public sources

- Xetra reference venue: https://live.deutsche-boerse.com/en/know-how/handeln/handelsplaetze/deutsche-boerse-xetra
- EXUS: https://etf.dws.com/en-gb/IE0006WW1TQ4-msci-world-ex-usa-ucits-etf-1c/
- XMEU: https://etf.dws.com/en-gb/LU0274209237-msci-europe-ucits-etf-1c/
- VUAA: https://fund-docs.vanguard.com/SandP_500_UCITS_ETF_USD_Accumulating_9694_EU_INT_UK_EN.pdf
- V50A: https://www.amundietf.com/pdfDocuments/monthly-factsheet/LU1681047236/ENG/FRA/INSTITUTIONNEL/ETF/20250831
- VWCE: https://fund-docs.vanguard.com/FTSE_All-World_UCITS_ETF_USD_Accumulating_9679_EU_INT_EN.pdf
- MSCI Europe equity benchmark: https://www.msci.com/indexes/index/990500/msci-europe-index
- STOXX equity benchmarks: https://stoxx.com/equity-indices/blue-chip-indices/
