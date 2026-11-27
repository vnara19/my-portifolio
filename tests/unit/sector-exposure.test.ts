import test from "node:test";
import assert from "node:assert/strict";
import { sectorExposure } from "../../src/modules/portfolio/domain/sector-exposure";
import { buildPortfolioDistribution } from "../../src/modules/portfolio/domain/portfolio-distribution";
const security={assetType:"stock",quoteSymbol:"UETW.DE",ticker:"UETW",assetName:"World"};
test("index proxy is normalized, dated, and never leaks later snapshots into history",()=>{
 const current=sectorExposure(security,"2026-11-24");
 assert.equal(current.weights.length,11);
 assert.ok(Math.abs(current.weights.reduce((s,p)=>s+p.weight,0)-100)<1e-10);
 assert.equal(current.sources[0].asOf,"2026-10-30");
 assert.equal(sectorExposure(security,"2026-09-30").sources[0].asOf,"2026-03-31");
 assert.equal(sectorExposure(security,"2026-03-30").weights[0].sector,"Sector Unavailable");
});
test("economic exposures do not confuse issuer or collateral with a fund sector",()=>{
 for(const [quoteSymbol,expected] of [["EGLN.L","Gold"],["CSH2.PA","Money Market"],["XDWT.DE","Information Technology"],["UNKNOWN","Sector Unavailable"]]){
  assert.equal(sectorExposure({...security,quoteSymbol},"2026-11-24").weights[0].sector,expected);
 }
 assert.equal(sectorExposure({...security,quoteSymbol:null,ticker:null,assetType:"fixed-income",productType:"CDB"},"2026-11-24").weights[0].sector,"Financials");
});
test("sector look-through preserves portfolio value and unknown exposure without inventing sector gains",()=>{
 const data=buildPortfolioDistribution([
  {assetId:"world",label:"World",assetClass:"Equities",productType:"ETF",currency:"EUR",valueUsd:1000,unrealizedGainUsd:40,sectorExposure:sectorExposure(security,"2026-11-24")},
  {assetId:"unknown",label:"Unknown",assetClass:"Equities",productType:"ETF",currency:"USD",valueUsd:200,unrealizedGainUsd:10},
 ]);
 assert.ok(Math.abs(data.sectors.reduce((s,r)=>s+r.valueUsd,0)-1200)<1e-9);
 assert.ok(Math.abs(data.sectors.reduce((s,r)=>s+r.share,0)-100)<1e-9);
 assert.equal(data.sectors.find(r=>r.label==="Sector Unavailable")?.valueUsd,200);
 assert.ok(data.sectors.every(r=>r.unrealizedGainUsd===null));
 assert.equal(data.sectorSources.length,1);
});
