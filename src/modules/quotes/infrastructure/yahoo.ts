import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().nullable().optional(),
            longName: z.string().nullable().optional(),
            shortName: z.string().nullable().optional(),
            instrumentType: z.string().nullable().optional(),
            fullExchangeName: z.string().nullable().optional(),
            regularMarketTime: z.number().nullable().optional(),
            regularMarketPrice: z.number().nullable().optional(),
          }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()).optional() })),
          }),
        }),
      )
      .nullable(),
    error: z.object({ code: z.string().optional(), description: z.string().optional() }).nullable().optional(),
  }),
});

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; meu-portfolio/1.0)" };
const saoPauloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });


export function toYahooSymbol(symbol: string) {
  if (symbol === "USD") {
    return "BRL=X";
  }

  return symbol.endsWith(".SAO") ? symbol.replace(/\.SAO$/, ".SA") : symbol;
}

async function fetchChart(symbol: string, range: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");

  try {
    const payload = chartSchema.parse(await fetchJson(url, { headers: HEADERS }));
    const result = payload.chart.result?.[0];

    if (!result) {
      throw new ProviderRefusalError("NOT_FOUND", `Yahoo Finance did not find ${symbol}.`);
    }

    return result;
  } catch (error) {

    if (error instanceof QuoteHttpError && error.statusCode === 404) {
      throw new ProviderRefusalError("NOT_FOUND", `Yahoo Finance did not find ${symbol}.`);
    }

    throw error;
  }
}


export async function fetchYahooPrice(symbol: string) {
  const result = await fetchChart(symbol, "5d");
  const price = result.meta.regularMarketPrice;

  if (!price || price <= 0) {
    throw new ProviderRefusalError("MISSING_QUOTE", `Yahoo Finance did not return the price for ${symbol}.`);
  }

  return { price, currency: result.meta.currency ?? null, name: result.meta.longName ?? result.meta.shortName ?? null,
    instrumentType: result.meta.instrumentType ?? null, exchange: result.meta.fullExchangeName ?? null,
    quoteDate: result.meta.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString().slice(0, 10) : null };
}


export async function fetchYahooDailyHistory(symbol: string, years = 3) {
  const result = await fetchChart(symbol, `${years}y`);
  const closes = result.indicators.quote[0]?.close ?? [];

  return {
    currency: result.meta.currency ?? null,
    points: (result.timestamp ?? []).flatMap((time, index) => {
      const value = closes[index];
      return value && value > 0 ? [{ day: saoPauloDay.format(new Date(time * 1000)), value }] : [];
    }),
  };
}

const searchSchema = z.object({ quotes: z.array(z.object({
  symbol: z.string(), shortname: z.string().optional(), longname: z.string().optional(),
  exchDisp: z.string().optional(), quoteType: z.string().optional(),
})).default([]) });

/** Search the provider catalog, rather than restricting users to issuer reference examples. */
export async function searchEuropeanListings(query: string) {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "30");
  url.searchParams.set("newsCount", "0");
  const result = searchSchema.parse(await fetchJson(url, { headers: HEADERS }));
  return result.quotes.filter((quote) =>
    /\.(DE|PA|L|MI|AS|SG|F|BE|MU|SW|VI|BR|LS|MC|ST|HE|CO|OL|IR|IC|PR|WA|AT|BD|XD|XC|NX)$/.test(quote.symbol) &&
    ["ETF", "EQUITY", "MUTUALFUND"].includes(quote.quoteType ?? "")
  ).filter((quote, index, all) => all.findIndex((other) => other.symbol === quote.symbol) === index)
    .map((quote) => ({ symbol: quote.symbol, name: quote.longname ?? quote.shortname ?? quote.symbol,
      exchange: quote.exchDisp ?? quote.symbol.split(".").at(-1)! }));
}
