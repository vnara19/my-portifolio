import { periodChange } from "./period-performance";
import { returnBaselineDay, type TwrObservation } from "./time-weighted-return";
import type { BenchmarkPoint } from "@/modules/quotes/application/sp500-benchmark";

export type MonthlyProfitability = { month:string; portfolio:number|null; benchmark:number|null; complete:boolean };
const day=(date:Date)=>date.toISOString().slice(0,10);
/** Monthly TWR, aligned to the same funded baseline and reporting-currency benchmark. */
export function monthlyProfitability(points:TwrObservation[],benchmark:BenchmarkPoint[],asOf:string):MonthlyProfitability[]{
 const first=points[0]; if(!first)return [];
 const result:MonthlyProfitability[]=[];
 const cursor=new Date(`${first.day.slice(0,7)}-01T00:00:00Z`);
 const quote=(date:string)=>{const p=benchmark.filter(p=>p.day<=date).at(-1);return p&&Date.parse(date)-Date.parse(p.day)<=7*86400000?p.value:null;};
 while(day(cursor)<=asOf){
  const start=day(new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),0)));
  const end=day(new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)));
  const through=end<asOf?end:asOf;
  const base=[start,returnBaselineDay(points)??start].sort().at(-1)!;
  const a=quote(base),b=quote(through);
  result.push({month:day(cursor).slice(0,7),portfolio:periodChange(points,start,through,null,true).percent,benchmark:a&&b?(b/a-1)*100:null,complete:first.day<=day(cursor)&&end<=asOf&&end<new Date().toISOString().slice(0,10)});
  cursor.setUTCMonth(cursor.getUTCMonth()+1);
 }
 return result;
}
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
export function riskMetrics(rows:MonthlyProfitability[],annualRate:number|null){
 const complete=rows.filter(r=>r.complete);
 const unavailable={beta:null,sharpe:null,sortino:null,benchmarkSharpe:null,benchmarkSortino:null,months:complete.length};
 if(complete.length<2||annualRate===null||!Number.isFinite(annualRate)||annualRate<0||annualRate>100||complete.some(r=>r.portfolio===null||r.benchmark===null))return unavailable;
 const p=complete.map(r=>r.portfolio!/100),b=complete.map(r=>r.benchmark!/100),pm=mean(p),bm=mean(b);
 const variance=mean(b.map(v=>(v-bm)**2));
 const ratio=(values:number[])=>{
  const average=mean(values),excess=average-annualRate/1200;
  const deviation=Math.sqrt(mean(values.map(v=>(v-average)**2)));
  const downside=Math.sqrt(mean(values.map(v=>Math.min(0,v-annualRate/1200)**2)));
  return {sharpe:deviation>1e-12?excess/deviation:null,sortino:downside>1e-12?excess/downside:null};
 };
 const portfolio=ratio(p),market=ratio(b);
 return {beta:variance>1e-12?mean(p.map((v,i)=>(v-pm)*(b[i]-bm)))/variance:null,...portfolio,benchmarkSharpe:market.sharpe,benchmarkSortino:market.sortino,months:complete.length};
}
/** Monetary profit excludes net funding, including after a full redemption. */
export function profitHistory(eur:TwrObservation[],usd:TwrObservation[],realized:{day:string;value:number}[],rates:{day:string;value:number}[]=[],sameCurrency=false){
 const dollars=new Map(usd.map(p=>[p.day,p.value]));
 let funding=eur[0]&&(eur[0].inflow??eur[0].flow??0)<=0?eur[0].value??0:0;
 let valid=true,realizedIndex=0,realizedValue=0;
 return eur.map(p=>{
  if(p.flow===null||p.value===null)valid=false;
  funding+=p.flow??0;
  while(realizedIndex<realized.length&&realized[realizedIndex].day<=p.day)realizedValue=realized[realizedIndex++].value;
  const value=dollars.get(p.day),rate=rates.filter(r=>r.day<=p.day).at(-1);
  const fx=sameCurrency?1:rate&&Date.parse(p.day)-Date.parse(rate.day)<=7*86400000?rate.value:p.value&&value!=null?value/p.value:null;
  return {day:p.day,profit:valid&&fx!==null?(p.value!-funding)*fx:null,realized:valid&&fx!==null?realizedValue*fx:null};
 });
}
