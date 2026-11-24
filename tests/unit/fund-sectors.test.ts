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
test("provider-reported Other is separate from genuinely missing allocation",()=>{
 const exposure=parseFundSectors(payload({stockPosition:{raw:0.9914},cashPosition:{raw:0.0082},bondPosition:{raw:0},otherPosition:{raw:0.0004}}),"UETW.DE","2026-11-24")!;
 assert.equal(exposure.weights.find(w=>w.sector==="Other Exposures")?.weight,0.04);
 assert.equal(exposure.weights.some(w=>w.sector==="Sector Unavailable"),false);
 const partial=parseFundSectors(payload({otherPosition:{raw:0.02}}),"X","2026-11-24")!;
 assert.equal(partial.weights.find(w=>w.sector==="Other Exposures")?.weight,2);
 assert.ok(Math.abs(partial.weights.find(w=>w.sector==="Sector Unavailable")!.weight-3)<1e-9);
});
test("explicit preferred and convertible allocations stay identified, without phantom rounding gaps",()=>{
 const exposure=parseFundSectors(payload({stockPosition:{raw:0.8},cashPosition:{raw:0.1},bondPosition:{raw:0.05},preferredPosition:{raw:0.03},convertiblePosition:{raw:0.02}}),"X","2026-11-24")!;
 assert.equal(exposure.weights.find(w=>w.sector==="Preferred Shares")?.weight,3);
 assert.equal(exposure.weights.find(w=>w.sector==="Convertible Securities")?.weight,2);
 assert.equal(exposure.weights.some(w=>w.sector==="Sector Unavailable"),false);
 assert.equal(parseFundSectors(payload({otherPosition:{raw:0.2}}),"X","2026-11-24"),null);
});
