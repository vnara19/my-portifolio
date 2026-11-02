import { getUserDb } from "@/lib/user-db";
import { fetchYahooSnapshot, fetchYahooDailyHistory } from "../infrastructure/yahoo";
import { quoteChange } from "../domain/market-change";
import { SELIC_RATE_KEY } from "./selic-reference";
export type StripIndex={price:number|null;change:number|null;asOf:string|null};
export type OverviewMarketStrip={USD:number|null;EUR:number|null;BTC:number|null;selic:number|null;spx:StripIndex;sxxp:StripIndex};
const emptyIndex=():StripIndex=>({price:null,change:null,asOf:null});
const cache=new Map<string,{expires:number;promise:Promise<StripIndex>}>();
/** Only public index identifiers are sent to Yahoo. Portfolio data stays in the database. */
function indexQuote(symbol:"^GSPC"|"^STOXX",asOf:string):Promise<StripIndex>{
 const current=asOf>=new Date().toISOString().slice(0,10),key=`${symbol}:${current?"current":asOf}`;
 const saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.promise;
 const promise=(async()=>{
  if(current){const q=await fetchYahooSnapshot(symbol);if(q.currency!==(symbol==="^GSPC"?"USD":"EUR"))return emptyIndex();return {price:q.price,change:quoteChange(q.price,q.previous),asOf:q.day};}
  const history=await fetchYahooDailyHistory(symbol,10);
  const last=history.points.filter(p=>p.day<=asOf).slice(-2);
  return {price:last.at(-1)?.value??null,change:quoteChange(last.at(-1)?.value??null,last.at(-2)?.value??null),asOf:last.at(-1)?.day??null};
 })().catch(()=>emptyIndex());
 if(cache.size>80)cache.clear();cache.set(key,{expires:Date.now()+(current?300_000:3600_000),promise});return promise;
}
export async function getOverviewMarketStrip(referenceDate:Date|undefined):Promise<OverviewMarketStrip>{
 const today=new Date().toISOString().slice(0,10);
 const monthEnd=referenceDate?new Date(Date.UTC(referenceDate.getUTCFullYear(),referenceDate.getUTCMonth()+1,0)).toISOString().slice(0,10):today;
 const asOf=monthEnd<today?monthEnd:today;
 const db=await getUserDb();
 const [spx,sxxp,rows,selic]=await Promise.all([indexQuote("^GSPC",asOf),indexQuote("^STOXX",asOf),db?.dailyQuote.findMany({where:{symbol:{in:["USD","EUR","BTC"]},quoteDate:{lte:new Date(asOf),gte:new Date(Date.parse(asOf)-14*86400000)}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true}})??[],db?.referenceRatePoint.findMany({where:{key:SELIC_RATE_KEY,effectiveOn:{lte:new Date(asOf)}},orderBy:{effectiveOn:"desc"},take:2,select:{percentAnnual:true}})??[]]);
 const series=(symbol:string)=>rows.filter(r=>r.symbol===symbol).map(r=>({day:r.quoteDate.toISOString().slice(0,10),value:r.valueBrl.toNumber()}));
 const usd=series("USD"),eur=series("EUR"),btc=series("BTC");
 const change=(points:{day:string;value:number}[])=>quoteChange(points.at(-1)?.value??null,points.at(-2)?.value??null);
 const nativeBtc=btc.flatMap(b=>{const u=usd.filter(u=>u.day<=b.day).at(-1);return u&&Date.parse(b.day)-Date.parse(u.day)<=7*86400000?[{...b,value:b.value/u.value}]:[];});
 return {USD:change(usd),EUR:change(eur),BTC:change(nativeBtc),selic:quoteChange(selic[0]?.percentAnnual.toNumber()??null,selic[1]?.percentAnnual.toNumber()??null),spx,sxxp};
}
