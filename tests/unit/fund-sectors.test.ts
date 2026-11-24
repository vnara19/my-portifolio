import test from "node:test";
import assert from "node:assert/strict";
import { parseFundSectors } from "../../src/modules/quotes/domain/fund-sectors";
const payload=(overrides:Record<string,unknown>={})=>({quoteSummary:{result:[{topHoldings:{stockPosition:{raw:0.8},cashPosition:{raw:0.1},bondPosition:{raw:0.05},sectorWeightings:[{technology:{raw:0.6}},{financial_services:{raw:0.4}}],...overrides}}]}});
test("fund sector weights apply to equity only and retain cash, bonds and unknown exposure",()=>{
 const exposure=parseFundSectors(payload(),"NEW.ETF","2026-11-24T12:00:00Z")!;
 assert.deepEqual(exposure.weights.map(w=>[w.sector,Math.round(w.weight)]),[["Information Technology",48],["Financials",32],["Cash & Savings",10],["Bonds",5],["Sector Unavailable",5]]);
 assert.equal(exposure.sources[0].asOf,undefined);
 assert.equal(exposure.sources[0].retrievedAt,"2026-11-24T12:00:00Z");
});
test("reject incomplete, duplicate, unknown, negative or implausible provider classifications",()=>{
 for(const overrides of [
  {sectorWeightings:[]},
  {sectorWeightings:[{technology:{raw:0.5}}]},
  {sectorWeightings:[{technology:{raw:0.5}},{technology:{raw:0.5}}]},
  {sectorWeightings:[{unknown:{raw:1}}]},
  {stockPosition:{raw:-1}},
  {stockPosition:{raw:1}},
 ])assert.equal(parseFundSectors(payload(overrides),"X","2026-11-24"),null);
 assert.equal(parseFundSectors({quoteSummary:{result:null}},"X","2026-11-24"),null);
});
test("normalize published rounding without changing total allocation",()=>{
 const exposure=parseFundSectors(payload({sectorWeightings:[{technology:{raw:0.599}},{financial_services:{raw:0.4}}]}),"X","2026-11-24")!;
 assert.ok(Math.abs(exposure.weights.reduce((s,w)=>s+w.weight,0)-100)<1e-9);
});
