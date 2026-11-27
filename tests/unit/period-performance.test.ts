import test from "node:test";
import assert from "node:assert/strict";
import {periodChange,overviewPeriodChanges,chartPeriodReturn,chartPeriodChange,portfolioPeriodStart} from "../../src/modules/portfolio/domain/period-performance";
import type {TwrObservation} from "../../src/modules/portfolio/domain/time-weighted-return";
const points:TwrObservation[]=[
 {day:"2025-11-01",value:100,flow:100,inflow:100,outflow:0},
 {day:"2026-10-31",value:110,flow:0,inflow:0,outflow:0},
 {day:"2026-11-01",value:160,flow:50,inflow:50,outflow:0},
 {day:"2026-11-02",value:136,flow:-40,inflow:0,outflow:40},
];
test("monthly change excludes deposits and withdrawals and shares one percentage across currencies",()=>{
 const change=overviewPeriodChanges(points,"2026-11-02",1.1).month;
 assert.equal(change.eur,16);
 assert.ok(Math.abs(change.usd!-17.6)<1e-10);
 assert.ok(Math.abs(change.percent!-10)<1e-10);
});
test("a new funded month's first-day fees reduce its return",()=>{
 const change=periodChange([{day:"2026-11-01",value:99,flow:100,inflow:100,outflow:0}],"2026-10-31","2026-11-01",1.1,true);
 assert.equal(change.eur,-1);
 assert.ok(Math.abs(change.percent!+1)<1e-10);
});
test("12-month change needs a recorded starting valuation",()=>{
 const change=overviewPeriodChanges(points,"2026-11-01",1.1).year;
 assert.equal(change.eur,10);
 assert.ok(Math.abs(change.percent!-10)<1e-10);
 assert.deepEqual(overviewPeriodChanges(points.slice(1),"2026-11-01",1.1).year,{usd:null,eur:null,percent:null});
});
test("missing valuations, flows or FX are never fabricated",()=>{
 assert.equal(periodChange([{...points[0]},{...points[1],flow:null}],"2025-11-01","2026-10-31",1).eur,null);
 assert.equal(periodChange([{...points[0]},{...points[1],value:null}],"2025-11-01","2026-10-31",1).percent,null);
 const change=periodChange(points,"2025-11-01","2026-10-31",null);
 assert.equal(change.eur,10);
 assert.equal(change.usd,null);
});

test("chart periods use TWR, include first funding fees and exclude later funding",()=>{
 const daily:TwrObservation[]=[
  {day:"2025-12-31",value:100,flow:100},
  {day:"2026-01-01",value:109,flow:10},
  {day:"2026-01-31",value:119.9,flow:0},
  {day:"2026-02-01",value:169.9,flow:50},
  {day:"2026-02-02",value:186.89,flow:0},
 ];
 assert.ok(Math.abs(chartPeriodReturn(daily,"2026-02-02","all")!-19.9)<1e-8);
 assert.ok(Math.abs(chartPeriodReturn(daily,"2026-02-02","ytd")!-19.9)<1e-8);
 assert.ok(Math.abs(chartPeriodReturn(daily,"2026-02-02","1m")!-21)<1e-8);
 assert.equal(chartPeriodReturn([{day:"2026-01-01",value:99,flow:100}],"2026-01-01","all"),-1.0000000000000009);
 assert.equal(chartPeriodReturn([{day:"2026-01-01",value:100,flow:0}],"2026-01-01","all"),0);
 assert.equal(chartPeriodReturn(daily.map(p=>p.day==="2026-02-01"?{...p,value:null}:p),"2026-02-02","all"),null);
});

test("Value selector shows monetary profit excluding purchases and redemptions",()=>{
 const result=chartPeriodChange(points,"2026-11-02","all",1.1);
 assert.equal(result.eur,26);
 assert.ok(Math.abs(result.usd!-28.6)<1e-10);
 assert.equal(chartPeriodChange([{day:"2026-01-01",value:99,flow:100}],"2026-01-01","all",1.1).eur,-1);
});
test("1M uses exactly 30 days and differs from calendar month and month-to-date",()=>{
 assert.equal(new Date(portfolioPeriodStart(Date.parse("2026-11-04"),"1m")).toISOString().slice(0,10),"2026-10-05");
 const daily:TwrObservation[]=[{day:"2026-10-04",value:100,flow:100},{day:"2026-10-05",value:110,flow:0},{day:"2026-10-31",value:90,flow:0},{day:"2026-11-04",value:99,flow:0}];
 assert.equal(chartPeriodChange(daily,"2026-11-04","1m",1).eur,-11);
 assert.equal(overviewPeriodChanges(daily,"2026-11-04",1).month.eur,9);
});
