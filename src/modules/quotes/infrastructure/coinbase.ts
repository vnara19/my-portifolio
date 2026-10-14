import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


const spotSchema = z.object({ data: z.object({ amount: z.coerce.number().positive() }) });


export async function fetchCoinbasePriceBrl(symbol: string) {
  const url = new URL(`https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-BRL/spot`);

  try {
    return spotSchema.parse(await fetchJson(url, undefined, { timeoutMs: 6_000, attempts: 2 })).data.amount;
  } catch (error) {
    if (error instanceof QuoteHttpError && error.statusCode === 404) {
      throw new ProviderRefusalError("NOT_FOUND", `Coinbase does not trade ${symbol} in BRL.`);
    }

    throw error;
  }
}
