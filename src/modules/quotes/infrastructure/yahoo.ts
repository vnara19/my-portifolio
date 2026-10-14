import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().nullable().optional(),
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

  return { price, currency: result.meta.currency ?? null };
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
