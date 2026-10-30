import { z } from "zod";

import type { QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { describeProviderError, fetchJson } from "@/modules/quotes/infrastructure/http";

export type CoinGeckoCoin = { id: string; name: string };

const KNOWN_COINS: Record<string, CoinGeckoCoin> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  SOL: { id: "solana", name: "Solana" },
};

const coinGeckoSearchSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      symbol: z.string(),
      name: z.string(),
      market_cap_rank: z.number().nullable().optional(),
    }),
  ),
});


export async function searchCoinGeckoCoins(symbol: string, apiKey?: string): Promise<CoinGeckoCoin[]> {
  const url = new URL("https://api.coingecko.com/api/v3/search");
  url.searchParams.set("query", symbol);
  const payload = coinGeckoSearchSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));

  return payload.coins
    .filter((coin) => coin.symbol.toUpperCase() === symbol)
    .sort((left, right) => (left.market_cap_rank ?? Infinity) - (right.market_cap_rank ?? Infinity))
    .map((coin) => ({ id: coin.id, name: coin.name }));
}


export async function resolveCoinGeckoCoin(symbol: string, apiKey?: string): Promise<CoinGeckoCoin | null> {
  const known = KNOWN_COINS[symbol];

  if (known) {
    return known;
  }

  return (await searchCoinGeckoCoins(symbol, apiKey))[0] ?? null;
}


export async function fetchCoinGeckoPrices(ids: string[], apiKey?: string, currency: "brl" | "usd" = "brl") {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", currency);
  const payload = z.record(z.string(), z.record(z.string(), z.number().positive())).parse(
    await fetchJson(url, { headers: headersFor(apiKey) }, { timeoutMs: 6_000, attempts: 2 }),
  );

  return new Map(Object.entries(payload).flatMap(([id, quote]) => quote[currency] ? [[id, quote[currency]] as const] : []));
}


export async function fetchCryptoQuotes(
  requests: { symbol: string; coinId?: string }[],
  apiKey?: string,
  usdBrl?: number,
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];
  const supported: { symbol: string; id: string }[] = [];

  for (const { symbol, coinId } of requests) {
    try {
      const coin = coinId ? { id: coinId } : await resolveCoinGeckoCoin(symbol, apiKey);

      if (coin) {
        supported.push({ symbol, id: coin.id });
      } else {
        results.push(
          quoteFailure(symbol, "coingecko", "NOT_FOUND", `CoinGecko did not find the ticker ${symbol}.`),
        );
      }
    } catch (error) {
      const described = describeProviderError(error);
      results.push(quoteFailure(symbol, "coingecko", described.code, described.message));
    }
  }

  if (supported.length === 0) {
    return results;
  }

  try {
    const prices = await fetchCoinGeckoPrices(
      [...new Set(supported.map((item) => item.id))],
      apiKey,
      usdBrl ? "usd" : "brl",
    );

    for (const item of supported) {
      const price = prices.get(item.id);
      results.push(
        price
          ? {
              symbol: item.symbol,
              provider: "coingecko",
              status: "SUCCESS",
              valueBrl: price * (usdBrl ?? 1),
            }
          : quoteFailure(
              item.symbol,
              "coingecko",
              "MISSING_QUOTE",
              `CoinGecko did not return ${item.symbol}.`,
            ),
      );
    }
  } catch (error) {
    const described = describeProviderError(error);
    results.push(
      ...supported.map((item) =>
        quoteFailure(item.symbol, "coingecko", described.code, described.message),
      ),
    );
  }

  return results;
}

function headersFor(apiKey?: string) {
  return apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
}

const coinGeckoChartSchema = z.object({ prices: z.array(z.tuple([z.number(), z.number()])) });


export const COINGECKO_HISTORY_DAYS = 365;


export async function fetchCoinGeckoDailyHistory(coinId: string, apiKey?: string) {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart`);
  url.searchParams.set("vs_currency", "brl");
  url.searchParams.set("days", String(COINGECKO_HISTORY_DAYS));
  url.searchParams.set("interval", "daily");
  const payload = coinGeckoChartSchema.parse(await fetchJson(url, { headers: headersFor(apiKey) }));

  return payload.prices
    .filter(([, price]) => price > 0)
    .map(([time, price]) => ({ day: new Date(time).toISOString().slice(0, 10), value: price }));
}

/** A single observation supplies both the storage quote and the USD quote shown during purchase entry. */
export async function fetchCoinGeckoPricePair(id: string, apiKey?: string) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", id);
  url.searchParams.set("vs_currencies", "brl,usd");
  const payload = z.record(z.string(), z.object({ brl: z.number().positive(), usd: z.number().positive().optional() })).parse(
    await fetchJson(url, { headers: headersFor(apiKey) }, { timeoutMs: 6_000, attempts: 2 }),
  );
  return payload[id] ?? null;
}
