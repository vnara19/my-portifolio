import { isBusinessDay } from "./business-days";
import { calculateIncomeMonth } from "./cdi-valuation";
import { holdingMarketMetrics, type MarketPoint } from "./holding-market-metrics";
type Input=Omit<Parameters<typeof calculateIncomeMonth>[0],"openingBalance"|"movements"|"asOf"|"onDailyBalance">;
/** Unitized gross contract growth in BRL; deposits and withdrawals are not returns. */
export function fixedIncomePerformance(input:Input,asOf:string){
 const empty=holdingMarketMetrics([],asOf).performance;
 if(input.startDate>=asOf)return empty;
 const cdiDays=new Set(input.rates.map(rate=>rate.date));
 const ipcaMonths=new Set((input.ipcaRates??[]).map(rate=>rate.date.slice(0,7)));
 const needsCdi=input.parts.some(part=>part.indexer==="CDI"),needsIpca=input.parts.some(part=>part.indexer==="IPCA");
 const end=input.maturityDate&&input.maturityDate<asOf?input.maturityDate:asOf;
 for(let day=input.startDate;day<end;day=new Date(Date.parse(day)+86400_000).toISOString().slice(0,10)){
  if(needsCdi&&isBusinessDay(day)&&!cdiDays.has(day))return empty;
  if(needsIpca&&!ipcaMonths.has(day.slice(0,7)))return empty;
 }
 const principal=1_000_000;
 const points:MarketPoint[]=[{day:input.startDate,value:principal}];
 const result=calculateIncomeMonth({...input,openingBalance:String(principal),movements:[],asOf,onDailyBalance:(day,value)=>{
  points.push({day:new Date(Date.parse(day)+86400_000).toISOString().slice(0,10),value});
 }});
 if(result.state!=="calculated")return empty;
 return holdingMarketMetrics(points,asOf).performance;
}
