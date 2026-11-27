import { z } from "zod";

import { fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";


const quoteSchema = z.object({
  results: z.array(z.object({ regularMarketPrice: z.number().nullable().optional() })).optional(),
  error: z.boolean().optional(),
  message: z.string().optional(),
});

export async function fetchBrapiPrice(symbol: string, token: string) {
  const ticker = symbol.replace(/\.SAO?$/, "");
  const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`);
  const payload = quoteSchema.parse(await fetchJson(url, { headers: { authorization: `Bearer ${token}` } }));
  const price = payload.results?.[0]?.regularMarketPrice;

  if (payload.error || !price || price <= 0) {
    throw new ProviderRefusalError("NOT_FOUND", payload.message ?? `brapi did not return ${ticker}.`);
  }

  return price;
}
