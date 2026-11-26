import test from "node:test";
import assert from "node:assert/strict";
import { fixedIncomePerformance } from "../../src/modules/portfolio/domain/fixed-income-performance";
const input={startDate:"2026-01-01",annualBasis:"CALENDAR_365" as const,parts:[{indexer:"PRE" as const,weight:"1",ratePercent:"13"}],rates:[],verifiedCoverage:[]};
test("fixed contract performance compounds by period without flows or FX",()=>{
 const result=fixedIncomePerformance(input,"2026-11-26");
 assert.ok(Math.abs(result['1w']!-(1.13**(7/365)-1)*100)<1e-8);
 assert.ok(Math.abs(result['1m']!-(1.13**(30/365)-1)*100)<1e-8);
 assert.equal(result['1y'],null);
 assert.equal(result['5y'],null);
 assert.ok(result.all!>result['3m']!);
});
test("CDI performance needs verified official observations and applies only business days",()=>{
 const cdi={...input,startDate:"2026-11-13",annualBasis:"BUSINESS_252" as const,parts:[{indexer:"CDI" as const,weight:"1",ratePercent:"110"}],rates:[{date:"2026-11-13",dailyPercent:"0.05"}],verifiedCoverage:[{from:"2026-11-13",through:"2026-11-13"}]};
 assert.ok(Math.abs(fixedIncomePerformance(cdi,"2026-11-16").all!-0.055)<1e-8);
 assert.equal(fixedIncomePerformance({...cdi,rates:[]},"2026-11-16").all,null);
 assert.equal(fixedIncomePerformance(cdi,"2026-11-16")['1w'],null);
});
