


export type QuoteRefreshRunStatus = "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ISSUES" | "FAILED";

export type QuoteFailureView = {
  symbol: string;
  assets: string[];
  provider: string;
  errorCode: string;
  errorMessage: string;
};


export type QuoteRefreshRunView = {
  id: string;
  status: QuoteRefreshRunStatus;
  quoteDate: string;
  startedAt: string;
  finishedAt: string | null;
  succeeded: number;
  failures: QuoteFailureView[];
  errorMessage: string | null;
  repricedMonth: string | null;
};

export type QuoteRefreshSummary = {
  generatedAt: string;
  lastUpdatedAt: string | null;
  lastRun: QuoteRefreshRunView | null;
};


export function isQuoteEditable({
  hasValue,
  carried,
  lastFailed,
}: {
  hasValue: boolean;
  carried: boolean;
  lastFailed: boolean;
}) {
  return !hasValue || carried || lastFailed;
}

const PROVIDER_LABELS: Record<string, string> = {
  "alpha-vantage": "Alpha Vantage",
  "awesome-api": "AwesomeAPI",
  bcb: "Banco Central (PTAX)",
  binance: "Binance",
  brapi: "brapi",
  coinbase: "Coinbase",
  coingecko: "CoinGecko",
  configuration: "Settings",
  finnhub: "Finnhub",
  fixed: "Fixed value",
  provider: "Provider",
  yahoo: "Yahoo Finance",
  tesouro: "Tesouro Nacional",
};

export function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}
