import test from "node:test";
import assert from "node:assert/strict";
import { nativeHistory, datedFx, investmentMonthReturn } from "@/modules/portfolio/domain/position-money";
import { emptyRecordedMonth, recordedByMonth } from "@/modules/portfolio/domain/position-transactions";
import type { PositionTransactionView } from "@/modules/portfolio/application/get-position-history";
import type { PositionObservation } from "@/modules/portfolio/domain/position-history";
const transaction=(month:string,kind:"CONTRIBUTION"|"WITHDRAWAL",quantity:number,amount:number,rate:number):PositionTransactionView=>({id:month,month,occurredOn:month+"-15",kind,quantity,amountBrl:amount,unitPriceBrl:100*rate,note:`Purchase: FX ${rate} BRL/USD.`,accountId:"a",accountLabel:"",monthId:month,transferId:null});
const transactions=[transaction("2026-01","CONTRIBUTION",1,500,5),transaction("2026-02","CONTRIBUTION",1,600,6),transaction("2026-03","WITHDRAWAL",.5,350,7)];
const observations:PositionObservation[]=[1,2,3].map((n,i)=>({month:`2026-0${n}`,accountId:"a",accountLabel:"",quantity:[1,2,1.5][i],openingQuantity:[0,1,2][i],recorded:emptyRecordedMonth(),unitPriceBrl:[500,600,700][i],totalBrl:[500,1200,1050][i],strategy:null,allocations:[]}));
const fixture={currency:"USD" as const,observations,transactions,months:observations.map(o=>({month:o.month,totalBrl:o.totalBrl})),monthly:new Map([["2026-01",5],["2026-02",6],["2026-03",7]]),daily:[],accountId:"a",selectedMonth:"2026-03",quoted:true};
test("native cost uses dated trade FX; purchases, withdrawals and FX changes are not USD performance",()=>{
 const view=nativeHistory(fixture);
 assert.equal(view.estimated,false);
 assert.equal(view.account.summary.current?.valueBrl,150);
 assert.equal(view.account.summary.appliedBrl,150);
 assert.equal(view.account.summary.averagePriceBrl,100);
 assert.equal(view.account.summary.gainBrl,0);
 assert.equal(view.account.transactions[0].amountBrl,100);
 for(let i=0;i<view.account.slots.length;i++){const s=view.account.slots[i];if(s.kind!=="present"||!s.step)continue;const prev=view.account.slots[i-1];const result=investmentMonthReturn(s,prev?.kind==="present"?prev.valueBrl:null);assert.equal(result.amount,0);assert.equal(result.percent,0);}
});
test("missing daily FX is explicit; monthly conversion is marked approximate and missing history is rejected",()=>{
 assert.equal(datedFx("2026-02-15",null,"USD",[],fixture.monthly)?.estimated,true);
 assert.equal(datedFx("2026-02-15",null,"USD",[{day:"2026-02-13",rate:5.8}],fixture.monthly)?.rate,5.8);
 const monthly=nativeHistory({...fixture,transactions:transactions.map(t=>({...t,note:null}))});assert.equal(monthly.estimated,true);
 assert.throws(()=>nativeHistory({...fixture,monthly:new Map()}),/Historical USD exchange rate/);
});
test("EUR reporting replays foreign transactions instead of relabelling BRL totals",()=>{
 const eur=nativeHistory({...fixture,currency:"EUR",transactions:transactions.map(t=>({...t,note:t.note?.replace('USD','EUR')??null}))});assert.equal(eur.account.summary.gainBrl,0);assert.equal(eur.account.summary.current?.valueBrl,150);
});
test("Modified Dietz weights flows while isolating investment gain",()=>{
 const view=nativeHistory(fixture);const slot=view.account.slots[1];assert.equal(slot.kind,"present");if(slot.kind!=="present"||!slot.step)return;
 const changed={...slot,valueBrl:220,step:{...slot.step,priceEffectBrl:10},recorded:recordedByMonth([{month:slot.month,kind:"CONTRIBUTION",amountBrl:100,quantity:1,transferId:null,occurredOn:"2026-02-15"}]).get(slot.month)!};
 const result=investmentMonthReturn(changed,100);assert.equal(result.amount,10);assert.ok(Math.abs(result.percent! - 10/(100+100*14/28)*100)<1e-8);
});
