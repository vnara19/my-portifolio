import { Prisma } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { readQuoteSeries } from "@/modules/quotes/application/month-quote-values";
import { automaticIncome, readTransactions, type PositionTransactionView } from "./get-position-history";
import type { PortfolioMonthSummary } from "./get-portfolio-months";
import { buildHistorySlots } from "../domain/position-history";
import { emptyRecordedMonth, recordedByMonth } from "../domain/position-transactions";
import { datedFx, type MoneyCurrency } from "../domain/position-money";
import { portfolioLedgerRows, type PortfolioLedgerFrame } from "../domain/portfolio-ledger";
import { positionTitle } from "../presentation/position-display";
import type { TransactionTarget } from "../ui/position-transaction-dialog";

export type PortfolioLedger = { rows: ReturnType<typeof portfolioLedgerRows>; transactions: PositionTransactionView[]; originals: PositionTransactionView[]; editEntries: PositionTransactionView[]; targets: Record<string,TransactionTarget> };
export const transactionCurrency=(entry: PositionTransactionView):MoneyCurrency=>entry.assetType==="crypto"?"USD":entry.baseCurrency==="EUR"?"EUR":entry.baseCurrency==="USD"?"USD":"BRL";

/** Bulk, user-scoped reads only. No quote-provider requests and no ledger writes. */
export async function getPortfolioLedger(months:PortfolioMonthSummary[]):Promise<PortfolioLedger|null>{
 const db=await getUserDb();if(!db || !months.length)return null;
 const [positions,stored,series,daily]=await Promise.all([
  db.position.findMany({select:{id:true,accountId:true,assetId:true,portfolioMonthId:true,quantity:true,openingQuantity:true,totalBrl:true,unitPriceBrl:true,strategy:true,calculationStartDate:true,calculatedIncomeBrl:true,incomeCalculatedThrough:true,portfolioMonth:{select:{referenceDate:true}},asset:{select:{name:true,ticker:true,assetType:true,quoteSymbol:true,baseCurrency:true}},allocations:{select:{assetClass:true,subclass:true,duration:true,weight:true}}}}),
  readTransactions(),readQuoteSeries(db,["USD","EUR"]),
  db.dailyQuote.findMany({where:{symbol:{in:["USD","EUR"]}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true}}),
 ]);
 const monthly=(currency:string)=>new Map(series.filter(q=>q.symbol===currency).map(q=>[q.referenceDate.toISOString().slice(0,7),q.valueBrl.toNumber()]));
 const rates={USD:monthly("USD"),EUR:monthly("EUR")};
 const days={USD:daily.filter(q=>q.symbol==="USD").map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()})),EUR:daily.filter(q=>q.symbol==="EUR").map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}))};
 const generated=positions.flatMap(p=>automaticIncome([p]).map(t=>({...t,assetId:p.assetId,assetName:p.asset.name,ticker:p.asset.ticker,assetType:p.asset.assetType,quoteSymbol:p.asset.quoteSymbol,baseCurrency:p.asset.baseCurrency})));
 const originals=[...stored,...generated].map(t=>({...t,assetName:positionTitle(t.assetName??"",t.ticker??null)})).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||a.id.localeCompare(b.id));
 const convert=(entry:PositionTransactionView,currency:MoneyCurrency):PositionTransactionView=>{
  const fx=currency==="BRL"?{rate:1,estimated:false}:datedFx(entry.occurredOn,entry.note,currency,days[currency],rates[currency]);
  return {...entry,amountBrl:fx?entry.amountBrl/fx.rate:entry.amountBrl,unitPriceBrl:fx&&entry.unitPriceBrl!==null?entry.unitPriceBrl/fx.rate:null,moneyUnavailable:!fx};
 };
 const transactions=originals.map(t=>convert(t,"USD"));
 const editEntries=originals.map(t=>convert(t,transactionCurrency(t)));
 const totals=new Map<string,Prisma.Decimal>();
 const targets:Record<string,TransactionTarget>={};
 for(const p of positions){const month=p.portfolioMonth.referenceDate.toISOString().slice(0,7);totals.set(month,(totals.get(month)??new Prisma.Decimal(0)).plus(p.totalBrl));targets[p.id]={positionId:p.id,assetName:p.asset.name,quoteSymbol:p.asset.quoteSymbol,quantity:p.quantity.toNumber(),unitPriceBrl:p.unitPriceBrl?.toNumber()??null,totalBrl:p.totalBrl.toNumber()};}
 const frames:PortfolioLedgerFrame[]=months.map(m=>{const rate=rates.USD.get(m.month);return {month:m.month,value:(totals.get(m.month)??new Prisma.Decimal(0)).isZero()?0:rate?(totals.get(m.month)??new Prisma.Decimal(0)).toNumber()/rate:null,flow:0,opening:0,estimated:false};});
 const frameMap=new Map(frames.map(f=>[f.month,f]));
 const assets=new Set(positions.map(p=>p.assetId));
 for(const assetId of assets){
  const held=positions.filter(p=>p.assetId===assetId);const raw=originals.filter(t=>t.assetId===assetId);const usd=transactions.filter(t=>t.assetId===assetId);
  const byAccount=new Map([...new Set(held.map(p=>p.accountId))].map(id=>[id,recordedByMonth(raw.filter(t=>t.accountId===id))]));
  const usdMonths=recordedByMonth(usd.filter(t=>!t.moneyUnavailable));
  const quoted=Boolean(held[0].asset.quoteSymbol)||held[0].asset.assetType==="international-bond";
  const slots=buildHistorySlots({months:months.map(m=>({month:m.month,totalBrl:(totals.get(m.month)??new Prisma.Decimal(0)).toNumber()})),scopeAccountId:null,quoted,observations:held.map(p=>{
   const month=p.portfolioMonth.referenceDate.toISOString().slice(0,7);const history=byAccount.get(p.accountId)!;const first=[...history.keys()].sort()[0];
   return {month,accountId:p.accountId,accountLabel:"",quantity:p.quantity.toNumber(),openingQuantity:p.openingQuantity.toNumber(),unitPriceBrl:p.unitPriceBrl?.toNumber()??null,totalBrl:p.totalBrl.toNumber(),strategy:p.strategy,allocations:p.allocations.map(a=>({...a,weight:a.weight.toNumber()*100})),recorded:history.get(month)??(p.calculationStartDate||(first&&month>=first)?emptyRecordedMonth():null)};
  })});
  const first=slots.find(s=>s.kind==="present")?.month;
  let previousGroupValue=0;
  for(const slot of slots){const f=frameMap.get(slot.month);if(!f)continue;const rate=rates.USD.get(slot.month);
   if(slot.kind==="missing")continue;
   if(slot.kind==="absent"){if(slot.exitBrl){if(!rate)f.flow=null;else if(f.flow!==null)f.flow+=slot.exitBrl/rate;f.estimated=true;}else if(previousGroupValue>0){f.flow=null;}previousGroupValue=0;continue;}
   previousGroupValue=slot.valueBrl;
   const entries=usd.filter(t=>t.month===slot.month);
   if(entries.some(t=>t.moneyUnavailable)){f.flow=null;f.opening=null;continue;}
   if(slot.source==="mixed"){f.flow=null;f.opening=null;continue;}
   if(slot.recorded){const ledger=usdMonths.get(slot.month)??emptyRecordedMonth();if(f.flow!==null)f.flow+=ledger.netFlowBrl;if(f.opening!==null)f.opening+=ledger.openingBrl;
    const source=raw.filter(t=>t.month===slot.month);f.estimated ||= source.some(t=>datedFx(t.occurredOn,t.note,"USD",days.USD,rates.USD)?.estimated);
    if(slot.month===first && slot.month!==months[0].month && slot.openingQuantity && ledger.openingBrl===0){if(!rate){f.opening=null;continue;}const opening=slot.openingQuantity*(quoted?(slot.priceBrl??0):slot.quantity?slot.valueBrl/slot.quantity:1)/rate;if(f.opening!==null)f.opening+=opening;f.estimated=true;}
   }else {const inferred=slot.entryBrl??(slot.month===first&&slot.month!==months[0].month?slot.valueBrl:slot.step?.flowBrl);if(inferred!==null&&inferred!==undefined){if(!rate)f.flow=null;else if(f.flow!==null)f.flow+=inferred/rate;f.estimated=true;}else if(slot.month!==months[0].month){f.flow=null;}}
  }
 }
 return {rows:portfolioLedgerRows(frames),transactions,originals,editEntries,targets};
}
