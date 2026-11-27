import { marketIdentity, type MARKET_KINDS } from "@/modules/portfolio/domain/market-assets";
import { fetchYahooPrice } from "@/modules/quotes/infrastructure/yahoo";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";

export async function fetchMarketPriceBrl(symbol: string, today: string) {
  const quote = await fetchYahooPrice(symbol);
  const date = quote.quoteDate ?? today;
  if (date > today) throw new Error("The source returned a future quote.");
  if (quote.currency !== "USD" && quote.currency !== "EUR" && quote.currency !== "BRL") throw new Error("Choose a listing traded in EUR, USD or BRL.");
  const fx = quote.currency === "BRL" ? 1 : (await fetchReferenceFxLatest(quote.currency, date)).value;
  return { ...quote, priceBrl: quote.price * fx, quoteDate: date };
}

const cache = new Map<string, { expires: number; result: ReturnType<typeof lookup> }>();
async function lookup(kind: typeof MARKET_KINDS[number], symbol: string, today: string) {
  const quote = await fetchMarketPriceBrl(symbol, today);
  return { ...quote, identity: marketIdentity(kind, symbol, quote) };
}

/** Cache public market observations only; signed proofs remain bound to each user/month. */
export async function lookupMarketListing(kind: typeof MARKET_KINDS[number], symbol: string, today: string) {
  const key = `${kind}:${symbol}:${today}`;
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.result;
  const result = lookup(kind, symbol, today);
  cache.set(key, { expires: Date.now() + 60_000, result });
  if (cache.size > 250) cache.delete(cache.keys().next().value!);
  try { return await result; } catch (error) { cache.delete(key); throw error; }
}
