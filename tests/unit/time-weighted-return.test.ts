import assert from "node:assert/strict";
import { test } from "node:test";
import { timeWeightedReturns } from "@/modules/portfolio/domain/time-weighted-return";
import { periodStart } from "@/modules/portfolio/domain/chart-period";
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
test("calendar ranges clamp leap days and All does not truncate history",()=>{
 assert.equal(periodStart(Date.parse("2024-03-31"),"1m"),Date.parse("2024-02-29"));
 assert.equal(periodStart(Date.parse("2026-10-29"),"ytd"),Date.parse("2026-01-01"));
 assert.equal(periodStart(Date.now(),"all"),-Infinity);
});
