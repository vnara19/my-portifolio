import { getUserDb } from "@/lib/user-db";
import type { PortfolioLedger } from "./get-portfolio-ledger";
import type { OverviewData } from "./get-overview-data";
import { datedFx } from "../domain/position-money";
import type { TwrObservation } from "../domain/time-weighted-return";

/** Values at every external-flow boundary are mandatory; absent coverage is never interpolated. */
export async function getOverviewPerformance(overview:OverviewData|null,ledger:PortfolioLedger|null):Promise<TwrObservation[]> {
  const db=await getUserDb();
  if (!db || !overview || !ledger) return [];
  const tx=[...ledger.originals].sort((a,b)=>a.occurredOn.localeCompare(b.occurredOn)||a.id.localeCompare(b.id));
  const assets=await db.asset.findMany({select:{id:true,quoteSymbol:true}});
  const monthlyPositions=await db.position.findMany({select:{assetId:true,quantity:true,portfolioMonth:{select:{referenceDate:true}}}});
  const invalidMonths=new Set<string>();
  for(const h of overview.history){
    const end=h.day??`${h.month}-31`;
    const units=new Map<string,number>();
    for(const entry of tx.filter(t=>t.occurredOn<=end))if(entry.assetId)units.set(entry.assetId,(units.get(entry.assetId)??0)+(entry.kind==="WITHDRAWAL"||(entry.kind==="INCOME"&&entry.amountBrl<0)?-1:1)*entry.quantity);
    const saved=new Map(monthlyPositions.filter(p=>p.portfolioMonth.referenceDate.toISOString().slice(0,7)===h.month).map(p=>[p.assetId,0]));
    for(const p of monthlyPositions.filter(p=>p.portfolioMonth.referenceDate.toISOString().slice(0,7)===h.month))saved.set(p.assetId,(saved.get(p.assetId)??0)+p.quantity.toNumber());
    for(const id of new Set([...saved.keys(),...units.keys()]))if(Math.abs((saved.get(id)??0)-(units.get(id)??0))>1e-7)invalidMonths.add(h.month);
  }
  const symbols=[...new Set(["USD",...assets.flatMap(a=>a.quoteSymbol?[a.quoteSymbol]:[])])];
  const quotes=await db.dailyQuote.findMany({where:{symbol:{in:symbols}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true}});
  const usd=quotes.filter(q=>q.symbol==="USD").map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}));
  const prices=new Map(symbols.map(symbol=>[symbol,quotes.filter(q=>q.symbol===symbol).map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}))]));
  const snapshots=new Map(overview.history.map(h=>[h.day??new Date(Date.UTC(h.date.getUTCFullYear(),h.date.getUTCMonth()+1,0)).toISOString().slice(0,10),h.totalUsd??null]));
  const end=[...snapshots.keys()].sort().at(-1)!;
  const flowDays=tx.filter(t=>t.occurredOn<=end&&!t.transferId).map(t=>t.occurredOn);
  const firstDay=tx[0]?.occurredOn??[...snapshots.keys()].sort()[0];
  const days=[...new Set([...snapshots.keys(),...flowDays,...quotes.map(q=>q.quoteDate.toISOString().slice(0,10)).filter(day=>day>=firstDay&&day<=end)])].sort();
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  const holdings=new Map<string,number>();
  const observations:TwrObservation[]=[];
  let cursor=0;
  for (const day of days) {
    let flow:number|null=0;
    while(cursor<tx.length && tx[cursor].occurredOn<=day){
      const entry=tx[cursor++];
      const id=entry.assetId;
      if (id) holdings.set(id,(holdings.get(id)??0)+(entry.kind==="WITHDRAWAL"||(entry.kind==="INCOME"&&entry.amountBrl<0)?-1:1)*entry.quantity);
      if(entry.occurredOn!==day || entry.transferId)continue;
      const paidIncome=entry.kind==="INCOME"&&entry.quantity===0;
      if(entry.kind==="INCOME"&&!paidIncome)continue;
      const fx=datedFx(day,entry.note,"USD",usd,new Map());
      if(!fx){flow=null;continue;}
      if(flow!==null)flow+=(entry.kind==="WITHDRAWAL"||paidIncome?-1:1)*entry.amountBrl/fx.rate;
    }
    let value:number|null=snapshots.get(day)??null;
    if (!snapshots.has(day)) {
      const fx=datedFx(day,null,"USD",usd,new Map());
      value=fx?0:null;
      for(const [id,units] of holdings){
        if(Math.abs(units)<1e-8)continue;
        const symbol=assetMap.get(id)?.quoteSymbol;
        const price=symbol?[...(prices.get(symbol)??[])].reverse().find(p=>p.day<=day&&Date.parse(day)-Date.parse(p.day)<=7*86400000):null;
        if(!price||!fx||units<0){value=null;break;}
        if(value!==null)value+=units*price.rate/fx.rate;
      }
    }
    if(invalidMonths.has(day.slice(0,7)))value=null;
    observations.push({day,value,flow});
  }
  return observations;
}
