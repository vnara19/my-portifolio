import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyMovers } from "@/modules/portfolio/presentation/daily-movers";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import type { HoldingAnalytics } from "@/modules/portfolio/application/get-holdings-analytics";
const position=(id:string,assetId:string,value:number,usd:number)=>({id,assetId,assetName:assetId,ticker:assetId,assetType:"eu-market",totalBrl:usd*5,totalUsd:usd,nativeValue:value,liquidated:false}) as MonthPosition;
const metric=(daily:number|null,dailyPercent:number|null)=>({daily,dailyPercent}) as HoldingAnalytics;

test("daily movers use Positions' native daily gains converted to USD",()=>{
 const rows=dailyMovers([position("a","ETF",100,110),position("b","BTC",50,50)],{a:metric(2,2),b:metric(-5,-10)},{ETF:"World ETF"});
 assert.equal(rows[0].label,"World ETF");
 assert.equal(rows[0].result,2.2);
 assert.ok(Math.abs(rows[0].percentage!-2)<1e-10);
 assert.equal(rows[0].totalValue,110);
 assert.equal(rows[1].result,-5);
});
test("daily movers aggregate accounts with a weighted denominator, including flat accounts",()=>{
 const [row]=dailyMovers([position("a","ETF",120,120),position("b","ETF",100,100)],{a:metric(20,20),b:metric(0,0)},{});
 assert.equal(row.result,20);assert.equal(row.percentage,10);assert.equal(row.totalValue,220);
});
test("unknown daily data never turns into a zero or a partial asset gain",()=>{
 assert.deepEqual(dailyMovers([position("a","ETF",100,100),position("b","ETF",100,100)],{a:metric(1,1),b:metric(null,null)},{}),[]);
 assert.deepEqual(dailyMovers([{...position("a","ETF",100,100),liquidated:true}],{a:metric(1,1)},{}),[]);
});
