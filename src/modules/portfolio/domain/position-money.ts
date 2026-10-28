/** Presentation-only currency conversion. Never use converted history as a write payload. */
import { buildHistorySlots, summarizeHistory, type PositionObservation, type PortfolioMonthTotal } from "./position-history";
import { recordedByMonth, emptyRecordedMonth } from "./position-transactions";
import type { PositionTransactionView } from "../application/get-position-history";
export type MoneyCurrency = "BRL" | "USD" | "EUR";
export type FxPoint = { day: string; rate: number };
export function datedFx(day: string, note: string | null, currency: MoneyCurrency, daily: FxPoint[], monthly: Map<string, number>) {
  if(currency === "BRL")return {rate:1, estimated:false};
  const contract = new RegExp(`FX (\\d+(?:\\.\\d+)?) BRL/${currency}\\.`).exec(note ?? "");
  if(contract && Number(contract[1])>0)return {rate:Number(contract[1]),estimated:false};
  const point=[...daily].reverse().find(p=>p.day<=day && Date.parse(day)-Date.parse(p.day)<=7*86400000 && p.rate>0);
  if(point)return {rate:point.rate,estimated:false};
  const rate=monthly.get(day.slice(0,7));
  return rate && rate>0 ? {rate,estimated:true} : null;
}
export function nativeHistory(input:{currency:MoneyCurrency; observations:PositionObservation[]; months:PortfolioMonthTotal[]; transactions:PositionTransactionView[]; monthly:Map<string,number>; daily:FxPoint[]; accountId:string; selectedMonth:string; quoted:boolean}) {
  let estimated=false;
  const transactions=input.transactions.map(t=>{
    const fx=datedFx(t.occurredOn,t.note,input.currency,input.daily,input.monthly);
    if(!fx)throw new Error(`Historical ${input.currency} exchange rate is missing for ${t.occurredOn}.`);
    estimated ||= fx.estimated;
    return {...t,amountBrl:t.amountBrl/fx.rate,unitPriceBrl:t.unitPriceBrl===null?null:t.unitPriceBrl/fx.rate};
  });
  const groups=new Map([...new Set(input.observations.map(o=>o.accountId))].map(id=>[id,recordedByMonth(transactions.filter(t=>t.accountId===id).slice().reverse())]));
  const fxFor=(month:string)=>{const rate=input.currency==="BRL"?1:input.monthly.get(month);if(!rate || rate<=0)throw new Error(`Historical ${input.currency} exchange rate is missing for ${month}.`);return rate;};
  const observations=input.observations.map(o=>({...o,totalBrl:o.totalBrl/fxFor(o.month),unitPriceBrl:o.unitPriceBrl===null?null:o.unitPriceBrl/fxFor(o.month),recorded:o.recorded ? groups.get(o.accountId)?.get(o.month)??emptyRecordedMonth():null}));
  const months=input.months.map(m=>({...m,totalBrl:m.totalBrl/fxFor(m.month)}));
  const scope=(id:string|null)=>{const slots=buildHistorySlots({months,observations,scopeAccountId:id,quoted:input.quoted});return{slots,summary:summarizeHistory(slots,input.selectedMonth,input.quoted),transactions:transactions.filter(t=>id===null||t.accountId===id)};};
  return {account:scope(input.accountId),all:scope(null),estimated};
}

/** Modified Dietz return: external capital movements are excluded from gain. */
export function investmentMonthReturn(slot: import("./position-history").PresentSlot, previousValue: number | null) {
 const step=slot.step;
 if(!step || step.priceEffectBrl===null)return {amount:null,percent:null};
 const amount=step.priceEffectBrl+(step.incomeBrl??0);
 if(step.acrossMissing)return {amount,percent:null};
 if(step.source==="estimated")return {amount,percent:step.pricePercent};
 const start=previousValue ?? slot.valueBrl-step.changeBrl;
 const end=Date.UTC(Number(slot.month.slice(0,4)),Number(slot.month.slice(5,7)),1);
 const beginning=Date.parse(slot.month+"-01");const days=(end-beginning)/86400000;
 let denominator=start;
 for(const movement of slot.recorded?.movements??[]){
  if(movement.kind==="INCOME")continue;
  const sign=movement.kind==="WITHDRAWAL"?-1:1;
  const day=movement.occurredOn?Math.max(0,Math.min(days,(Date.parse(movement.occurredOn)-beginning)/86400000)):days/2;
  denominator+=sign*movement.amountBrl*(days-day)/days;
 }
 return {amount,percent:denominator>1e-8?amount/denominator*100:null};
}
