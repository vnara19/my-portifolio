import { z } from "zod";
import { fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";

const rateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), base: z.string(), quote: z.string(), rate: z.number().positive() });

/** ECB daily reference rates, without credentials. Retain the observation date on weekends. */
export async function fetchReferenceFxLatest(currency: "USD" | "EUR", today: string) {
  const url = new URL(`https://api.frankfurter.dev/v2/providers/ecb/rate/${currency}/BRL`);
  url.searchParams.set("date", today);
  const point = rateSchema.parse(await fetchJson(url));
  validatePair(point, currency, today);
  return { day: point.date, value: point.rate };
}

export async function fetchReferenceFxHistory(currency: "USD" | "EUR", from: string, to: string) {
  const url = new URL("https://api.frankfurter.dev/v2/providers/ecb/rates");
  url.searchParams.set("base", currency);
  url.searchParams.set("quotes", "BRL");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const points = z.array(rateSchema).parse(await fetchJson(url));
  for (const point of points) validatePair(point, currency, to);
  return points.filter((point) => point.date >= from).map((point) => ({ day: point.date, value: point.rate }));
}

function validatePair(point: z.infer<typeof rateSchema>, currency: string, today: string) {
  const day = new Date(`${point.date}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== point.date || point.base.toUpperCase() !== currency || point.quote.toUpperCase() !== "BRL" || point.date > today || !Number.isFinite(point.rate)) {
    throw new ProviderRefusalError("INVALID_RESPONSE", "The exchange-rate provider returned an invalid pair, date or rate.");
  }
}
