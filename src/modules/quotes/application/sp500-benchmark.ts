import { fetchYahooDailyHistory } from "../infrastructure/yahoo";
export type BenchmarkPoint = { day: string; value: number };
export type Sp500Benchmark = { points: BenchmarkPoint[]; source: string; available: boolean };
let cache: { expires: number; promise: Promise<Sp500Benchmark> } | null = null;
/** Public index data only; never sends user holdings or transactions to a provider. */
export function getSp500Benchmark(): Promise<Sp500Benchmark> {
  if (cache && cache.expires>Date.now()) return cache.promise;
  const promise = fetchYahooDailyHistory("^GSPC",10).then(result=>{
    if (result.currency!=="USD" || !result.points.length) throw new Error("Missing USD index history");
    return { points:result.points, source:"Yahoo Finance · S&P 500 Price Index (^GSPC)",available:true };
  }).catch(()=>({points:[],source:"S&P 500 Price Index (^GSPC)",available:false}));
  cache={expires:Date.now()+3600_000,promise};
  return promise;
}
