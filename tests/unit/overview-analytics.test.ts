import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyProfitability, profitHistory, riskMetrics } from "../../src/modules/portfolio/domain/overview-analytics";
import { portfolioGains } from "../../src/modules/portfolio/domain/portfolio-gains";

test("monthly profitability excludes new funding and aligns benchmark",()=>{
 const points=[{day:"2025-01-01",value:100,flow:100},{day:"2025-01-31",value:220,flow:100},{day:"2025-02-28",value:242,flow:0}];
 const result=monthlyProfitability(points,[{day:"2024-12-31",value:100},{day:"2025-01-31",value:105},{day:"2025-02-28",value:115.5}],"2025-02-28");
 assert.ok(Math.abs(result[0].portfolio!-10)<1e-8); assert.ok(Math.abs(result[1].portfolio!-10)<1e-8);
 assert.ok(Math.abs(result[0].benchmark!-5)<1e-8);assert.equal(result[0].complete,true);
});
test("beta uses aligned completed monthly returns and risk-free rate affects ratios only",()=>{
 const rows=[-2,1,3].map((r,i)=>({month:`2025-0${i+1}`,portfolio:2*r,benchmark:r,complete:true}));
 const a=riskMetrics(rows,0),b=riskMetrics(rows,2);
 assert.ok(Math.abs(a.beta!-2)<1e-8);assert.equal(a.beta,b.beta);assert.ok(a.sharpe!>b.sharpe!);assert.ok(a.sortino!>b.sortino!);
 assert.equal(riskMetrics(rows.slice(0,1),2).beta,null);
 assert.equal(riskMetrics(rows,null).sharpe,null);
});
test("profit preserves gains on full redemption and converts using dated FX",()=>{
 const eur=[{day:"2025-01-01",value:99,flow:100},{day:"2025-01-02",value:110,flow:0},{day:"2025-01-03",value:0,flow:-110}];
 const result=profitHistory(eur,[],[{day:"2025-01-01",value:-1},{day:"2025-01-03",value:10}],[{day:"2025-01-01",value:1.2},{day:"2025-01-03",value:1.3}]);
 assert.equal(result[0].profit,-1.2);assert.equal(result[2].profit,13);assert.equal(result[2].realized,13);
});
test("realized history reuses average-cost sales and commissions",()=>{
 const steps:number[]=[];
 const result=portfolioGains([{holding:"a",kind:"CONTRIBUTION",quantity:2,amountBrl:202,feeBrl:2,usdRate:1,transferId:null},{holding:"a",kind:"WITHDRAWAL",quantity:2,amountBrl:220,usdRate:1,transferId:null}],[],undefined,(_i,n)=>steps.push(n));
 assert.deepEqual(steps,[-2,18]);assert.equal(result.totalUsd,18);
});

import { parseRiskFreeRate } from "../../src/modules/portfolio/domain/risk-free-rate";
test("annual risk reference rejects malformed or out-of-range inputs",()=>{
 for(const raw of ["", "-1", "101", "2.123", "Infinity", "2%", {}, null]) assert.equal(parseRiskFreeRate(raw),null);
 assert.equal(parseRiskFreeRate("2,5"),"2.5"); assert.equal(parseRiskFreeRate("0"),"0"); assert.equal(parseRiskFreeRate("100"),"100");
});


test("risk sampling excludes the first partial calendar month",()=>{
 const rows=monthlyProfitability([{day:"2025-05-15",value:100,flow:100,inflow:100,outflow:0},{day:"2025-05-31",value:105,flow:0,inflow:0,outflow:0},{day:"2025-06-30",value:110,flow:0,inflow:0,outflow:0}],[],"2025-06-30");
 assert.equal(rows[0].complete,false);assert.equal(rows[1].complete,true);
 assert.equal(riskMetrics(rows,2).months,1);
});
test("USD profit does not reconvert with EUR FX and survives a full withdrawal",()=>{
 const points=[{day:"2025-01-01",value:100,flow:100},{day:"2025-01-02",value:0,flow:-110}];
 assert.deepEqual(profitHistory(points,points,[{day:"2025-01-02",value:10}],[],true).at(-1),{day:"2025-01-02",profit:10,realized:10});
});
