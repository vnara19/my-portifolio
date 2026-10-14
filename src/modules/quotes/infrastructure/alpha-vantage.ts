import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";

const alphaVantageSchema = z.object({

  "Global Quote": z.record(z.string(), z.string()).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

export async function fetchAlphaVantageQuotes(
  symbols: string[],
  apiKey?: string,
): Promise<QuoteResult[]> {
  if (!apiKey) {
    return symbols.map((symbol) =>
      quoteFailure(
        symbol,
        "alpha-vantage",
        "MISSING_API_KEY",
        "Configure ALPHA_VANTAGE_API_KEY to update this asset.",
      ),
    );
  }

  const results: QuoteResult[] = [];

  for (const symbol of symbols) {
    try {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "GLOBAL_QUOTE");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", apiKey);
      const payload = alphaVantageSchema.parse(await fetchJson(url));


      if (payload.Note || payload.Information) {
        throw new ProviderRefusalError(
          "RATE_LIMITED",
          "Alpha Vantage rejected the request: the 25 daily request limit was reached or the key has no access.",
        );
      }

      const price = Number(payload["Global Quote"]?.["05. price"]);

      if (payload["Error Message"] || !(price > 0)) {
        throw new ProviderRefusalError("NOT_FOUND", `Alpha Vantage did not return the quote for ${symbol}.`);
      }

      results.push({ symbol, provider: "alpha-vantage", status: "SUCCESS", valueBrl: price });
    } catch (error) {
      const described = describeProviderError(error);
      results.push(
        quoteFailure(symbol, "alpha-vantage", described.code, described.message),
      );
    }
  }

  return results;
}

const alphaVantageLookupSchema = z.object({
  "Global Quote": z.record(z.string(), z.string()).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});


export async function lookupAlphaVantageSymbol(
  symbol: string,
  apiKey: string,
): Promise<{ found: true; priceBrl: number } | { found: false }> {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const payload = alphaVantageLookupSchema.parse(await fetchJson(url));

  if (payload.Note || payload.Information) {
    throw new ProviderRefusalError(
      "RATE_LIMITED",
      "Alpha Vantage rejected the request: the usage limit was reached or the key has no access.",
    );
  }

  if (payload["Error Message"]) {
    throw new ProviderRefusalError("PROVIDER_ERROR", "Alpha Vantage rejected the request.");
  }

  const quote = payload["Global Quote"];
  const price = quote ? Number(quote["05. price"]) : Number.NaN;

  return Number.isFinite(price) && price > 0 ? { found: true, priceBrl: price } : { found: false };
}

const alphaVantageMonthlySchema = z.object({
  "Monthly Time Series": z.record(z.string(), z.object({ "4. close": z.coerce.number().positive() })).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});


export async function fetchAlphaVantageMonthlyCloses(symbol: string, apiKey: string) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_MONTHLY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const payload = alphaVantageMonthlySchema.parse(await fetchJson(url));

  if (payload.Note || payload.Information) {
    throw new ProviderRefusalError(
      "RATE_LIMITED",
      "Alpha Vantage rejected the request: the usage limit was reached or the key has no access.",
    );
  }

  if (payload["Error Message"] || !payload["Monthly Time Series"]) {
    throw new ProviderRefusalError("NOT_FOUND", `Alpha Vantage has no history for ${symbol}.`);
  }

  return Object.entries(payload["Monthly Time Series"]).map(([day, values]) => ({ day, value: values["4. close"] }));
}
