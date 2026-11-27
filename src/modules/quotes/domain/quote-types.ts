export type QuoteRequest = {
  symbol: string;
  instrumentType: string;
  baseCurrency: string;


  providerId?: string;
};

export type QuoteSuccess = {
  symbol: string;
  provider: string;
  status: "SUCCESS";
  valueBrl: number;

  quoteDate?: string;
};

export type QuoteFailure = {
  symbol: string;
  provider: string;
  status: "FAILED";
  errorCode: string;
  errorMessage: string;
};

export type QuoteResult = QuoteSuccess | QuoteFailure;

export type QuoteProviderConfiguration = {
  awesomeApiKey?: string;
  coinGeckoApiKey?: string;
  finnhubApiKey?: string;
  alphaVantageApiKey?: string;

  brapiToken?: string;
};

export function quoteFailure(
  symbol: string,
  provider: string,
  errorCode: string,
  errorMessage: string,
): QuoteFailure {
  return { symbol, provider, status: "FAILED", errorCode, errorMessage };
}
