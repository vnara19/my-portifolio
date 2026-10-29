import assert from "node:assert/strict";
import { test } from "node:test";
import { xirr,dailyOpenGain,overviewPerformanceMetrics } from "@/modules/portfolio/domain/overview-performance-metrics";
import { recordedTradeFeeBrl } from "@/modules/portfolio/domain/purchase-cost";
import { exposureCurrency,valuationCurrency } from "@/modules/portfolio/presentation/position-display";
test("XIRR uses dated funding, not a CAGR of the time-weighted return",()=>{
 const result=xirr([{day:"2023-01-01",amount:-100},{day:"2024-01-01",amount:-50},{day:"2024-12-31",amount:176}]);
 assert.ok(Math.abs(result!-10)<1e-7);
 assert.equal(xirr([{day:"2026-01-01",amount:100}]),null);
 assert.equal(xirr([{day:"2023-01-01",amount:-100},{day:"2024-01-01",amount:110}])?.toFixed(6),"10.000000");
});
test("daily open gains exclude added capital, sales and commissions",()=>{
 const result=dailyOpenGain([{units:12,oldUnits:10,currentPrice:110,previousPrice:100,newUnits:2,newPrincipal:210}]);
 assert.equal(result.amount,110);assert.ok(Math.abs(result.percent!-110/1210*100)<1e-8);
 const sale=dailyOpenGain([{units:5,oldUnits:5,currentPrice:110,previousPrice:100,newUnits:0,newPrincipal:0}]);assert.equal(sale.amount,50);
 assert.equal(dailyOpenGain([{units:5,oldUnits:5,currentPrice:110,previousPrice:null,newUnits:0,newPrincipal:0}]).amount,null);
});
test("recorded commission breakdown preserves the stored cash total",()=>{
 assert.equal(recordedTradeFeeBrl("Purchase: 2 × EUR 100; commission EUR 3; FX 6 BRL/EUR."),18);
 assert.equal(recordedTradeFeeBrl(null),0);
});
test("crypto is grouped as exposure without changing its USD valuation currency",()=>{
 assert.equal(exposureCurrency("crypto","BTC"),"Cryptocurrency");assert.equal(valuationCurrency("crypto","BTC"),"USD");assert.equal(exposureCurrency("br-stock","BRL"),"BRL");
});
test("summary cutoffs cannot include future months and do not guess missing cash flows",()=>{
 const points=[{day:"2023-01-01",value:100,flow:100},{day:"2024-01-01",value:110,flow:0,dailyGainUsd:2,dailyGainPercent:2}];
 assert.equal(overviewPerformanceMetrics(points,"2024-01-01").annualizedPercent?.toFixed(6),"10.000000");
 assert.equal(overviewPerformanceMetrics(points,"2023-01-01").annualizedPercent,null);
 assert.equal(overviewPerformanceMetrics([{...points[0],flow:null},points[1]],"2024-01-01").annualizedPercent,null);
});
