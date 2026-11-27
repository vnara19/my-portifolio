import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTradeCsv,compileTradeImport } from "@/modules/portfolio/domain/tradingview-import";
const header="Symbol,Side,Qty,Fill Price,Commission,Closing Time\n";
test("cash funding rows are ignored while fractional fills and commissions stay exact",()=>{
 const source=header+'$CASH,Deposit,100,,,2026-01-01 09:00:00\nTEST:X,Buy,0.123456789,81.123456,0.37,2026-01-02 13:30:00\n';
 const result=parseTradeCsv(source);assert.equal(result.cashRows,1);assert.equal(result.trades.length,1);
 assert.equal(result.trades[0].quantity,"0.123456789");assert.equal(result.trades[0].price,"81.123456");
 assert.equal(result.trades[0].commission,"0.37");assert.equal(result.trades[0].day,"2026-01-02");
});
test("equal trades are retained; malformed and unknown operations are rejected",()=>{
 const row='TEST:X,Buy,1,100,0,2026-01-02 13:30:00\n';
 assert.equal(parseTradeCsv(header+row+row).trades.length,2);
 assert.throws(()=>parseTradeCsv(header+'TEST:X,Unknown,1,100,0,2026-01-02 13:30:00'));
 assert.throws(()=>parseTradeCsv(header+'TEST:X,Buy,1,100,0,2026-02-31 13:30:00'));
});
test("compile preserves trade fills instead of replacing them with historical closes",()=>{
 const {trades}=parseTradeCsv(header+'TEST:X,Buy,2,80,1,2026-01-02 13:30:00\n');
 const listings=[{source:"TEST:X",symbol:"X.DE",ticker:"X",name:"X",currency:"EUR",kind:"eu-market",instrument:"EU_ETF",assetClass:"Renda Variável",subclass:"Ações - Ex: USA"}] as const;
 const market={prices:{"X.DE":[{day:"2026-01-02",value:90},{day:"2026-01-30",value:95}]},fx:{USD:[{day:"2026-01-02",value:5},{day:"2026-01-30",value:5}],EUR:[{day:"2026-01-02",value:6},{day:"2026-01-30",value:6}]}};
 const plan=compileTradeImport(trades,[...listings],market,"2026-01-31");
 assert.equal(plan.tables.positionTransactions.length,1);assert.equal(plan.tables.assets.length,1);
 assert.equal(plan.tables.positionTransactions[0].unitPriceBrl,"480");
 assert.equal(plan.tables.positionTransactions[0].amountBrl,"966");
 assert.equal(plan.tables.positions[0].totalBrl,"1140");
 assert.equal(plan.tables.positionTransactions[0].kind,"CONTRIBUTION");
 assert.throws(()=>compileTradeImport(trades,[...listings],{...market,fx:{USD:[],EUR:[]}},"2026-01-31"));
 assert.throws(()=>compileTradeImport([...trades,{...trades[0],side:"Sell",quantity:"3"}],[...listings],market,"2026-01-31"));
});
