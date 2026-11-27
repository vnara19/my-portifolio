import assert from "node:assert/strict";
import { test } from "node:test";
import { returnBaselineDay, timeWeightedReturns } from "@/modules/portfolio/domain/time-weighted-return";
import { periodStart, monthlyObservationTime } from "@/modules/portfolio/domain/chart-period";
test("TWR excludes deposits and withdrawals, linking investment returns",()=>{
 const points=timeWeightedReturns([
  {day:"2026-01-01",value:100,flow:100},{day:"2026-01-02",value:200,flow:100},
  {day:"2026-01-03",value:150,flow:-50},{day:"2026-01-04",value:165,flow:0},
  {day:"2026-01-05",value:81.75,flow:-75},
 ]);
 assert.equal(points[1].percent,0);assert.equal(points[2].percent,0);
 assert.ok(Math.abs(points[3].percent!-10)<1e-8);
 assert.ok(Math.abs(points[4].percent!-4.5)<1e-8);
});
test("full redemption and a later reinvestment do not create losses or gains",()=>{
 const result=timeWeightedReturns([{day:"2026-01-01",value:100,flow:100},{day:"2026-01-02",value:0,flow:-100},{day:"2026-01-03",value:200,flow:200},{day:"2026-01-04",value:220,flow:0}]);
 assert.equal(result[2].percent,0);assert.ok(Math.abs(result[3].percent!-10)<1e-8);
});
test("missing flow-date values invalidate the linked return rather than interpolate",()=>{
 const result=timeWeightedReturns([{day:"2026-01-01",value:100,flow:100},{day:"2026-01-02",value:null,flow:100},{day:"2026-01-03",value:220,flow:0}]);
 assert.equal(result[2].percent,null);
});
test("rolling 1M stays 30 days across leap years and All does not truncate history",()=>{
 assert.equal(periodStart(Date.parse("2024-03-31"),"1m"),Date.parse("2024-03-01"));
 assert.equal(periodStart(Date.parse("2026-10-29"),"ytd"),Date.parse("2026-01-01"));
 assert.equal(periodStart(Date.now(),"all"),-Infinity);
});

test("first funded day includes price movement and fees instead of silently resetting the return", () => {
 const points=timeWeightedReturns([{day:"2026-01-01",value:95,flow:100},{day:"2026-01-02",value:104.5,flow:0}]);
 assert.ok(Math.abs(points[0].percent!+5)<1e-9);
 assert.ok(Math.abs(points[1].percent!-4.5)<1e-9);
 assert.equal(returnBaselineDay([{day:"2026-01-01",value:95,flow:100}]),"2025-12-31");
 assert.equal(returnBaselineDay([{day:"2026-01-01",value:95,flow:0}]),"2026-01-01");
});

test("same-day gross purchases and redemptions are not lost by netting their amounts", () => {
 const points=timeWeightedReturns([{day:"2026-01-01",value:100,flow:100},
  {day:"2026-01-02",value:100,flow:0,inflow:200,outflow:200},
  {day:"2026-01-03",value:130,flow:0,inflow:200,outflow:200}]);
 assert.equal(points[1].percent,0);
 assert.ok(Math.abs(points[2].percent!-10)<1e-9);
});

test("large funding with a fee is a finite small loss, not missing performance", () => {
 const points=timeWeightedReturns([{day:"2026-01-01",value:1,flow:1},{day:"2026-01-02",value:9996,flow:10000}]);
 assert.ok(Math.abs(points[1].percent! - (-5/10001*100))<1e-9);
});

test("a complete sale preserves its realized return and re-entry includes its fee", () => {
 const points=timeWeightedReturns([{day:"2026-01-01",value:100,flow:100},{day:"2026-01-02",value:0,flow:-110},
  {day:"2026-01-03",value:0,flow:0},{day:"2026-01-04",value:99,flow:100}]);
 assert.ok(Math.abs(points[1].percent!-10)<1e-9);
 assert.ok(Math.abs(points[3].percent!-8.9)<1e-9);
});

test("nonfinite, missing, contradictory and duplicate-day observations never produce a return", () => {
 for (const point of [
  {day:"2026-01-02",value:100,flow:NaN},
  {day:"2026-01-02",value:100,flow:0,inflow:100,outflow:0},
  {day:"2026-01-02",value:100,flow:0,inflow:null,outflow:0},
  {day:"2026-01-01",value:100,flow:0},
 ]) assert.equal(timeWeightedReturns([{day:"2026-01-01",value:100,flow:100},point]).at(-1)?.percent,null);
});

test("independent units replay follows the asset price despite multiple funding and withdrawal dates", () => {
 const prices=[110,99,105,115,120];
 const deposits=[1000,500,0,1200,0];
 const withdrawals=[0,200,0,1800,0];
 let units=0,previousPrice=100;
 const points=prices.map((price,index)=>{
  units+=deposits[index]/previousPrice;
  units-=withdrawals[index]/price;
  previousPrice=price;
  return {day:`2026-01-0${index+1}`,value:units*price,flow:deposits[index]-withdrawals[index],inflow:deposits[index],outflow:withdrawals[index]};
 });
 assert.ok(Math.abs(timeWeightedReturns(points).at(-1)!.percent!-20)<1e-9);
});

import { historyThroughMonth } from "../../src/modules/portfolio/domain/time-weighted-return";
test("historical performance stops at its selected month after rollover", () => {
  const history = ["2026-09-01", "2026-10-01", "2026-11-01"].map(day => ({ date: new Date(day) }));
  assert.deepEqual(historyThroughMonth(history, new Date("2026-10-01")), history.slice(0, 2));
  assert.deepEqual(historyThroughMonth(history, new Date("2026-11-01")), history);
});

test("monthly chart windows use dated observations inside the trailing 30-day range",()=>{
 const today=Date.parse("2026-11-05T12:00:00Z");
 assert.equal(monthlyObservationTime("2026-11",today),Date.parse("2026-11-05"));
 assert.equal(monthlyObservationTime("2026-10",today),Date.parse("2026-10-31"));
 assert.equal(periodStart(monthlyObservationTime("2026-11",today),"1m"),Date.parse("2026-10-06"));
});
