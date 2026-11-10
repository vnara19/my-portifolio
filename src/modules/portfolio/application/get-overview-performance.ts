import { readInternationalBond } from "../domain/international-bond";
import { bondReportingUnitPrice } from "../domain/bond-performance";
import { dailyOpenGain } from "../domain/overview-performance-metrics";
import { getUserDb } from "@/lib/user-db";
import type { PortfolioLedger } from "./get-portfolio-ledger";
import type { OverviewData } from "./get-overview-data";
import { datedFx } from "../domain/position-money";
import { historyThroughMonth, type TwrObservation } from "../domain/time-weighted-return";
import { Prisma } from "@/generated/prisma/client";
import { reportingFxSeries, tradeReportingFx } from "../domain/trade-reporting-fx";
import { recordedTradeAmounts } from "../domain/purchase-cost";

/** Values at every external-flow boundary are mandatory; absent coverage is never interpolated. */
export async function getOverviewPerformance(overview:OverviewData|null,ledger:PortfolioLedger|null,currency:"USD"|"EUR"="USD"):Promise<TwrObservation[]> {
  const db=await getUserDb();
  if (!db || !overview || !ledger) return [];
  const history=historyThroughMonth(overview.history,overview.referenceDate);
  if (!history.length) return [];
  const tx=[...ledger.originals].sort((a,b)=>a.occurredOn.localeCompare(b.occurredOn)||a.id.localeCompare(b.id));
  const assets=await db.asset.findMany({select:{id:true,quoteSymbol:true,assetType:true,baseCurrency:true,fixedIncomeContract:true}});
  const monthlyPositions=await db.position.findMany({select:{assetId:true,quantity:true,portfolioMonth:{select:{referenceDate:true}}}});
  const invalidMonths=new Set<string>();
  for(const h of history){
    const end=h.day??`${h.month}-31`;
    const units=new Map<string,number>();
    for(const entry of tx.filter(t=>t.occurredOn<=end))if(entry.assetId)units.set(entry.assetId,(units.get(entry.assetId)??0)+(entry.kind==="WITHDRAWAL"||(entry.kind==="INCOME"&&entry.amountBrl<0)?-1:1)*entry.quantity);
    const saved=new Map(monthlyPositions.filter(p=>p.portfolioMonth.referenceDate.toISOString().slice(0,7)===h.month).map(p=>[p.assetId,0]));
    for(const p of monthlyPositions.filter(p=>p.portfolioMonth.referenceDate.toISOString().slice(0,7)===h.month))saved.set(p.assetId,(saved.get(p.assetId)??0)+p.quantity.toNumber());
    for(const id of new Set([...saved.keys(),...units.keys()]))if(Math.abs((saved.get(id)??0)-(units.get(id)??0))>1e-7)invalidMonths.add(h.month);
  }
  const symbols=[...new Set(["USD","EUR",...assets.flatMap(a=>a.quoteSymbol?[a.quoteSymbol]:[])])];
  const quotes=await db.dailyQuote.findMany({where:{symbol:{in:symbols}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true,baseCurrency:true,provider:true,fetchedAt:true}});
  const operationRates = reportingFxSeries(quotes);
  const usd=quotes.filter(q=>q.symbol==="USD").map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}));
  const prices=new Map(symbols.map(symbol=>[symbol,quotes.filter(q=>q.symbol===symbol).map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber(),currency:q.baseCurrency}))]));
  const snapshots=new Map(history.map(h=>[h.day??new Date(Date.UTC(h.date.getUTCFullYear(),h.date.getUTCMonth()+1,0)).toISOString().slice(0,10),(currency==="EUR"?h.totalEur:h.totalUsd)??null]));
  const end=[...snapshots.keys()].sort().at(-1)!;
  const flowDays=tx.filter(t=>t.occurredOn<=end&&!t.transferId).map(t=>t.occurredOn);
  const firstDay=tx[0]?.occurredOn??[...snapshots.keys()].sort()[0];
  const days=[...new Set([...snapshots.keys(),...flowDays,...quotes.map(q=>q.quoteDate.toISOString().slice(0,10)).filter(day=>day>=firstDay&&day<=end)])].sort();
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  const bonds=new Map(assets.flatMap(asset=>{const bond=readInternationalBond(asset.fixedIncomeContract);return bond?[[asset.id,bond] as const]:[];}));
  const eur=quotes.filter(q=>q.symbol==="EUR").map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}));
  const reportingRates=currency==="EUR"?eur:usd;
  const unitReporting=(id:string,on:string)=>{
    const asset=assetMap.get(id),symbol=asset?.quoteSymbol;
    const bond=bonds.get(id);
    if(bond){
      const nativeFx=datedFx(on,null,bond.currency,bond.currency==="EUR"?eur:usd,new Map());
      const reportingFx=datedFx(on,null,currency,reportingRates,new Map());
      return bondReportingUnitPrice(bond,on,nativeFx?.rate??null,reportingFx?.rate??null);
    }
    const price=symbol?[...(prices.get(symbol)??[])].reverse().find(p=>p.day<=on&&Date.parse(on)-Date.parse(p.day)<=7*86400000):null;
    if(!price)return null;
    const nativeCurrency=asset?.assetType==="crypto"?"USD":price.currency;
    if(!["USD","EUR","BRL"].includes(nativeCurrency))return null;
    const native=nativeCurrency as "USD"|"EUR"|"BRL";
    const rates=native==="EUR"?eur:usd;
    const observed=datedFx(price.day,null,native,rates,new Map());
    const current=datedFx(on,null,native,rates,new Map());
    const reporting=datedFx(on,null,currency,reportingRates,new Map());
    return observed&&current&&reporting?price.rate/observed.rate*current.rate/reporting.rate:null;
  };
  const holdings=new Map<string,number>();
  const observations:TwrObservation[]=[];
  let cursor=0;
  for (const day of days) {
    const before=new Map(holdings);
    const bought=new Map<string,{units:number;principal:number|null}>();
    const sold=new Map<string,number>();
    let flow:number|null=0;
    let inflow:number|null=0;
    let outflow:number|null=0;
    while(cursor<tx.length && tx[cursor].occurredOn<=day){
      const entry=tx[cursor++];
      const id=entry.assetId;
      const exact=recordedTradeAmounts({ ...entry, quantity:new Prisma.Decimal(entry.quantity), amountBrl:new Prisma.Decimal(entry.amountBrl), unitPriceBrl:entry.unitPriceBrl===null?null:new Prisma.Decimal(entry.unitPriceBrl) });
      const netWithdrawal = /^Net withdrawal: BRL (\d+(?:\.\d+)?);/.exec(entry.note ?? "")?.[1];
      const paid = new Prisma.Decimal(netWithdrawal ?? exact?.amountBrl ?? entry.amountBrl);
      if (id) holdings.set(id,(holdings.get(id)??0)+(entry.kind==="WITHDRAWAL"||(entry.kind==="INCOME"&&entry.amountBrl<0)?-1:1)*entry.quantity);
      if(entry.occurredOn!==day || entry.transferId)continue;
      if(id && entry.kind==="WITHDRAWAL")sold.set(id,(sold.get(id)??0)+entry.quantity);
      if(id && (entry.kind==="CONTRIBUTION"||entry.kind==="OPENING")){
        const previous=bought.get(id)??{units:0,principal:0};
        const fx=tradeReportingFx(day, entry.note, currency, operationRates);
        const principal=id&&bonds.has(id)?paid:exact?exact.amountBrl.minus(exact.feeBrl):entry.unitPriceBrl===null?null:new Prisma.Decimal(entry.unitPriceBrl).mul(entry.quantity);
        bought.set(id,{units:previous.units+entry.quantity,principal:previous.principal!==null&&principal!==null&&fx?previous.principal+principal.div(fx.divisor).toNumber():null});
      }
      const paidIncome=entry.kind==="INCOME"&&entry.quantity===0;
      if(entry.kind==="INCOME"&&!paidIncome)continue;
      const fx=tradeReportingFx(day, entry.note, currency, operationRates);
      if(!fx){flow=null;inflow=null;outflow=null;continue;}
      if(flow!==null && inflow!==null && outflow!==null){
        const outward=entry.kind==="WITHDRAWAL"||paidIncome;
        const signed=paid.div(fx.divisor).mul(outward ? -1 : 1).toNumber();
        flow+=signed;
        inflow+=Math.max(signed,0);outflow+=Math.max(-signed,0);
      }
    }
    // Reconciled daily closes take precedence over older monthly valuation snapshots.
    let value:number|null=0;
    {
      for(const [id,units] of holdings){
        if(Math.abs(units)<1e-8)continue;
        const price=unitReporting(id,day);
        if(price===null||units<0){value=null;break;}
        if(value!==null)value+=units*price;
      }
    }
    if(value===null && snapshots.has(day))value=snapshots.get(day)??null;
    if(invalidMonths.has(day.slice(0,7)))value=null;
    const previousDay=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
    const daily=dailyOpenGain([...holdings].map(([id,units])=>({units,oldUnits:Math.max(0,(before.get(id)??0)-(sold.get(id)??0)),currentPrice:unitReporting(id,day),previousPrice:unitReporting(id,previousDay),newUnits:bought.get(id)?.units??0,newPrincipal:bought.get(id)?.principal??null})));
    observations.push({day,value,flow,inflow,outflow,dailyGainUsd:invalidMonths.has(day.slice(0,7))?null:daily.amount,dailyGainPercent:invalidMonths.has(day.slice(0,7))?null:daily.percent});
  }
  return observations;
}
