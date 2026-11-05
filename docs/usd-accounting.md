# USD portfolio accounting

The Overview uses USD as its accounting reference. Transactions are converted at acquisition-day historical FX; current holdings use valuation-day FX. Gains, TWR, XIRR, period profit, distribution gains, holdings performance and risk observations share that USD basis. EUR is a current display equivalent of the same USD gain, not independently measured EUR investment return. Total portfolio value also has BRL and EUR equivalents. Asset pages retain the asset's native currency.

The S&P 500 Total Return benchmark remains in USD for like-currency comparisons. Its dividends are reinvested in the benchmark; no coupon receipt is inferred for user bonds.

1M is exactly 30 trailing days in all shared chart controls. Other rolling periods retain calendar-month/year boundaries. Monthly charts retain dated monthly observations within the selected window; a trailing return is unavailable when a daily start valuation is missing, rather than substituting a full calendar-month return. Monthly risk samples exclude the initial partial month and the current unfinished month; partial months remain visible in profitability history.

New international bond purchases are cost-only. The market-valuation action has been removed. Legacy contract fields/readers remain solely for existing data and backup compatibility; no migration or deletion is performed. Coupon schedules remain informational. Tesouro Direto is separate and continues to use official market redemption prices.

The current Treasury listing is attempted twice before using the official historical CSV. Dates are never rewritten to today and observations more than seven days old are rejected. A source outage can still legitimately produce a warning.
