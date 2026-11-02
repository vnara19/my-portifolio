import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";
import { usableHistoricalClose } from "../domain/history-errata";


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
            exchangeTimezoneName: z.string().nullable().optional(),
            regularMarketTime: z.number().nullable().optional(),
            regularMarketPrice: z.number().nullable().optional(),
            regularMarketVolume: z.number().nullable().optional(),
            firstTradeDate: z.number().nullable().optional(),
            marketCap: z.number().nullable().optional(),
          }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()).optional(), high: z.array(z.number().nullable()).optional(), low: z.array(z.number().nullable()).optional(), volume: z.array(z.number().nullable()).optional() })),
          }),
        }),
      )
      .nullable(),
    error: z.object({ code: z.string().optional(), description: z.string().optional() }).nullable().optional(),
  }),
});

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; meu-portfolio/1.0)" };
export function yahooQuoteDay(timestamp: number, exchangeTimezone: string | null | undefined) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: exchangeTimezone || "UTC" }).format(new Date(timestamp * 1000));
}


export function toYahooSymbol(symbol: string) {
  if (symbol === "USD") {
    return "BRL=X";
  }

  return symbol.endsWith(".SAO") ? symbol.replace(/\.SAO$/, ".SA") : symbol;
}

async function fetchChart(symbol: string, range: string, timeoutMs?: number, period?:{from:number;to:number}) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  if(period){url.searchParams.delete("range");url.searchParams.set("period1",String(period.from));url.searchParams.set("period2",String(period.to));}

  try {
    const payload = chartSchema.parse(await fetchJson(url, { headers: HEADERS }, { timeoutMs }));
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


export async function fetchYahooPrice(symbol: string, timeoutMs?: number) {
  const result = await fetchChart(symbol, "5d", timeoutMs);
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
  return dailyHistory(result, symbol);
}

/** Only completed sessions are accepted by the recent-closing reconciliation. */
export async function fetchYahooRecentDailyHistory(symbol: string) {
  return dailyHistory(await fetchChart(symbol, "5d"), symbol);
}

function dailyHistory(result: Awaited<ReturnType<typeof fetchChart>>, symbol: string) {
  const closes = result.indicators.quote[0]?.close ?? [];

  return {
    currency: result.meta.currency ?? null,
    points: (result.timestamp ?? []).flatMap((time, index) => {
      const value = closes[index];
      const day = yahooQuoteDay(time, result.meta.exchangeTimezoneName);
      return value && value > 0 && usableHistoricalClose(symbol, day, value) ? [{ day, value }] : [];
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

/** A regular-session comparison, never the chart range's first-price baseline. */
export async function fetchYahooSnapshot(symbol:string){
 const result=await fetchChart(symbol,"5d",6000);
 const price=result.meta.regularMarketPrice;
 const time=result.meta.regularMarketTime;
 if(!price||!time)throw new Error("Missing index quote");
 const day=yahooQuoteDay(time,result.meta.exchangeTimezoneName);
 const history=dailyHistory(result,symbol).points;
 const previous=history.filter(p=>p.day<day).at(-1);
 return {price,currency:result.meta.currency??null,day,previous:previous?.value??null,previousDay:previous?.day??null};
}

/** Public listing data, including ranges needed for holdings risk statistics. */
export async function fetchYahooHoldingHistory(symbol:string){
 const result=await fetchChart(symbol,"10y",8000),quote=result.indicators.quote[0];
 const firstTrade=result.meta.firstTradeDate;
 let origin:ReturnType<typeof dailyHistory>["points"][number]|null=null;
 if(firstTrade!=null&&firstTrade<(result.timestamp?.[0]??0)){
  try{origin=dailyHistory(await fetchChart(symbol,"10y",6000,{from:firstTrade,to:firstTrade+14*86400}),symbol).points[0]??null;}catch{}
 }
 const allTimeAvailable=firstTrade!=null&&(origin!==null||Math.abs((result.timestamp?.[0]??0)-firstTrade)<7*86400);
 return {currency:result.meta.currency??null,exchange:result.meta.fullExchangeName??null,
  marketCap:result.meta.marketCap??null,allTimeAvailable,
  points:[...(origin?[{...origin,high:null,low:null,volume:null}]:[]),...(result.timestamp??[]).flatMap((time,i)=>{
   const value=quote.close?.[i],day=yahooQuoteDay(time,result.meta.exchangeTimezoneName);
   return value&&value>0&&usableHistoricalClose(symbol,day,value)?[{day,value,high:quote.high?.[i]??null,low:quote.low?.[i]??null,volume:quote.volume?.[i]??null}]:[];
  })]};
}
