import { z } from "zod";

import { fetchJson } from "@/modules/quotes/infrastructure/http";

const awesomeCurrencySchema = z.record(
  z.string(),
  z.object({ bid: z.coerce.number().positive() }),
);

export async function fetchUsdBrl(apiKey?: string) {
  const url = new URL("https://economia.awesomeapi.com.br/json/last/USD-BRL");
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const payload = awesomeCurrencySchema.parse(await fetchJson(url, { headers }));
  const quote = payload.USDBRL;

  if (!quote) {
    throw new Error("AwesomeAPI did not return USD-BRL.");
  }

  return quote.bid;
}


const awesomeDailySchema = z.array(z.object({ bid: z.coerce.number().positive(), timestamp: z.coerce.number() }));
const saoPauloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });


export const AWESOME_DAILY_LIMIT = 360;


export async function fetchUsdBrlDaily(startDay: string, endDay: string, apiKey?: string) {
  const url = new URL(`https://economia.awesomeapi.com.br/json/daily/USD-BRL/${AWESOME_DAILY_LIMIT}`);
  url.searchParams.set("start_date", startDay.replaceAll("-", ""));
  url.searchParams.set("end_date", endDay.replaceAll("-", ""));
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const payload = awesomeDailySchema.parse(await fetchJson(url, { headers }));

  return payload.map((quote) => ({ day: saoPauloDay.format(new Date(quote.timestamp * 1000)), value: quote.bid }));
}
