# Native-currency purchases and commission

The US, Brazilian and European Market and Cryptocurrency entries use a purchase
form with the verified market quote in trading currency, editable purchase price,
fractional quantity (up to 12 decimal places), commission (zero by default), and
purchase date. Native market quotes are separate from execution prices. Crypto
purchase entry uses USD from the same CoinGecko observation as its BRL valuation;
legacy crypto storage currency/provider semantics are unchanged.

Ticker confirmation is a compact Verified status. Exchange, ISIN, fund information,
quote provenance and settlement are collapsed under Details. Manual liquidity is
removed for new positions in these four groups; fixed income and Tesouro Direto
forms keep their prior behavior.

The server validates purchase currency against verified identity or an owned asset,
requires valid nonfuture acquisition dates through the selected reporting month,
and fetches acquisition-date ECB FX before beginning the write transaction. USD
reference observations needed by the gains ledger are retained in daily quotes;
existing published observations are preserved. Settlement is derived server-side.

Position quantity and market value exclude commission. The acquisition transaction
is a CONTRIBUTION, with amountBrl = (quantity * native execution price + native
commission) * acquisition FX. Its executed unitPriceBrl excludes commission. The
existing amountBrl-based average-cost ledger therefore includes fees in unrealized
cost and carries them proportionally into realized gain on partial sales. Native
price, fee and applied FX are also retained as a readable transaction note. Existing
backup v5, restore and undo already preserve these fields; no migration or backup
contract change is required. Existing historical records are not rewritten.

Issuer-derived asset class is saved to position allocations and flows into Overview
class distributions. Crypto allocation is derived server-side as well. No changes
to the portfolio's cash positions or broker balances are implied by purchase entry.

## Standard settlement guidance

- US listed stocks/ETFs/REITs: T+1.
- European listed instruments: T+2, switching to T+1 on 11 October 2027.
- Brazilian equities/FIIs/equity ETFs: T+2; bond ETFs: T+1.
- Crypto: 24/7 trading, with settlement/withdrawal dependent on platform/network.

These are standard settlement conventions, not promised withdrawal dates or a
liquidity guarantee for every instrument. Stored legacy D+ keys remain compatible.

Sources:
- https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/new-t1-settlement-cycle-what-investors-need-know-investor-bulletin
- https://www.euronext.com/en/regulation/t1-programme
- https://www.b3.com.br/en_us/products-and-services/trading/fixed-income/fixed-income-etf.htm
- https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/etf-de-renda-variavel.htm
- https://help.coinbase.com/en/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/available-balance-faq
