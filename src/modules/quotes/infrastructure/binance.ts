import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


const priceSchema = z.object({ price: z.coerce.number().positive() });
const klinesSchema = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()));

const BASE = "https://api.binance.com/api/v3";


const MARKET_DATA_BASE = "https://data-api.binance.vision/api/v3";


async function fetchBinance(path: string, params: Record<string, string>) {
  const build = (base: string) => {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  };

  try {
    return await fetchJson(build(BASE));
  } catch (error) {
    if (error instanceof QuoteHttpError && error.statusCode === 451) {
      return fetchJson(build(MARKET_DATA_BASE));
    }

    throw error;
  }
}

async function firstPair<T>(symbol: string, read: (pair: string) => Promise<T>) {
  for (const quote of ["BRL", "USDT"] as const) {
    try {
      return { quote, value: await read(`${symbol}${quote}`) };
    } catch (error) {
      // A missing pair returns HTTP 400; other errors stop the request.
      if (!(error instanceof QuoteHttpError && error.statusCode === 400)) {
        throw error;
      }
    }
  }

  throw new ProviderRefusalError("NOT_FOUND", `Binance does not trade ${symbol} in BRL or USDT.`);
}


export async function fetchBinancePriceBrl(symbol: string, usdBrl: number | null) {
  const { quote, value } = await firstPair(symbol, async (pair) =>
    priceSchema.parse(await fetchBinance("/ticker/price", { symbol: pair })).price,
  );

  if (quote === "BRL") {
    return value;
  }

  if (!usdBrl) {
    throw new ProviderRefusalError("MISSING_USD_QUOTE", `Binance quotes ${symbol} in USDT and today's USD exchange rate is unavailable.`);
  }

  return value * usdBrl;
}


export async function fetchBinanceMonthlyCloses(symbol: string, months = 40) {
  const { quote, value } = await firstPair(symbol, async (pair) =>
    klinesSchema.parse(await fetchBinance("/klines", { symbol: pair, interval: "1M", limit: String(months) })),
  );

  return {
    currency: quote === "BRL" ? "BRL" : "USD",
    points: value.map(([openTime, , , , close]) => {
      const open = new Date(openTime);
      const lastDay = new Date(Date.UTC(open.getUTCFullYear(), open.getUTCMonth() + 1, 0));
      return { day: lastDay.toISOString().slice(0, 10), value: Number(close) };
    }),
  };
}
