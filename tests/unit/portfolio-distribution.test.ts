import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioDistribution, type DistributionHolding } from "../../src/modules/portfolio/domain/portfolio-distribution";
import { exposureCurrency } from "../../src/modules/portfolio/presentation/position-display";
const holdings:DistributionHolding[]=[
 {assetId:"world",label:"WORLD",assetClass:"Equities",currency:"EUR",valueUsd:600,unrealizedGainUsd:60},
 {assetId:"btc",label:"BTC",assetClass:"Cryptocurrency",currency:"USD",valueUsd:200,unrealizedGainUsd:-10},
 {assetId:"bond",label:"BOND",assetClass:"Fixed Income",currency:"EUR",valueUsd:150,unrealizedGainUsd:5},
 {assetId:"gold",label:"GOLD",assetClass:"Commodities",currency:"EUR",valueUsd:50,unrealizedGainUsd:15},
];
test("distribution reconciles all views with portfolio totals and distinct ETF exposures",()=>{
 const data=buildPortfolioDistribution(holdings);
 assert.equal(data.assetCount,4);
 for(const rows of [data.assets,data.types,data.currencies]){
  assert.equal(rows.reduce((s,r)=>s+r.valueUsd,0),1000);
  assert.equal(rows.reduce((s,r)=>s+r.share,0),100);
  assert.equal(rows.reduce((s,r)=>s+r.unrealizedGainUsd!,0),70);
  assert.equal(rows.every(r=>/^#[0-9a-f]{6}$/i.test(r.color)),true);
 }
 assert.deepEqual(data.types.map(r=>r.label),["Equities","Cryptocurrency","Fixed Income","Commodities"]);
 assert.deepEqual(data.currencies.map(r=>[r.label,r.share]),[["EUR",80],["USD",20]]);
});
test("multiple holdings of one security group once and missing cost remains unknown",()=>{
 const data=buildPortfolioDistribution([holdings[0],{...holdings[0],valueUsd:100,unrealizedGainUsd:null},{...holdings[1],valueUsd:0}]);
 assert.equal(data.assetCount,1);
 assert.equal(data.assets.length,1);
 assert.equal(data.assets[0].valueUsd,700);
 assert.equal(data.assets[0].unrealizedGainUsd,null);
 assert.equal(data.types[0].unrealizedGainUsd,null);
 assert.equal(buildPortfolioDistribution([]).assets.length,0);
});
test("cryptocurrency currency exposure follows its denomination with legacy USD compatibility",()=>{
 assert.equal(exposureCurrency("crypto","USD"),"USD");
 assert.equal(exposureCurrency("crypto","EUR"),"EUR");
 assert.equal(exposureCurrency("crypto","BRL"),"BRL");
 assert.equal(exposureCurrency("crypto","BTC"),"USD");
});
