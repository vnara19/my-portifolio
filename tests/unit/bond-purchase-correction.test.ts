import assert from "node:assert/strict";
import { test } from "node:test";
import { correctedBondPurchase, bondPurchaseRemovalIssue } from "@/modules/portfolio/domain/bond-purchase-correction";
import { bondCostState, type InternationalBond } from "@/modules/portfolio/domain/international-bond";
const bond:InternationalBond = { type:"international-bond", identifier:"US61768UU475", issuer:"Morgan Stanley", issuerCountry:"United States", family:"Corporate", currency:"USD", structure:"Fixed", faceAmount:"10000", faceValuePerBond:"1000", settlementDate:"2025-06-23", maturityDate:"2030-04-12", totalPaid:"9951.40", accruedInterestPaid:"87.53", valuationMode:"Cost", quotes:[] };
test("bond purchase corrections convert units to principal and total purchase interest without mutating the original",()=>{
 const corrected=correctedBondPurchase(bond,{date:"2025-06-24",units:"5",totalPaid:"4975.70",accruedPerBond:"8.753"});
 assert.equal(corrected.faceAmount,"5000");assert.equal(corrected.accruedInterestPaid,"43.765");assert.equal(corrected.totalPaid,"4975.70");assert.equal(bond.faceAmount,"10000");
 assert.equal(bondCostState(corrected,"2026-11-03").cost.toFixed(),"4975.7");
});
test("invalid corrections cannot erase holdings, create negative interest or place maturity before purchase",()=>{
 const input={date:"2025-06-23",units:"10",totalPaid:"9951.40",accruedPerBond:"8.753"};
 assert.throws(()=>correctedBondPurchase(bond,{...input,units:"0"}));
 assert.throws(()=>correctedBondPurchase(bond,{...input,accruedPerBond:"-1"}));
 assert.throws(()=>correctedBondPurchase(bond,{...input,date:"2031-01-01"}));
 assert.throws(()=>correctedBondPurchase(bond,{...input,accruedPerBond:"1000"}));
});

test("deleting a bond acquisition permits derived maturity but protects dependent receipts and linked trades",()=>{
 const purchase={id:"purchase",note:"Bond acquisition",transferId:null};
 const maturity={id:"exit",note:"maturity",transferId:null};
 assert.equal(bondPurchaseRemovalIssue([purchase],purchase.id,"maturity"),null);
 assert.equal(bondPurchaseRemovalIssue([purchase,maturity],purchase.id,"maturity"),null);
 assert.match(bondPurchaseRemovalIssue([purchase,{...maturity,note:"Bond coupon"}],purchase.id,"maturity")!,/later transactions/);
 assert.match(bondPurchaseRemovalIssue([{...purchase,transferId:"linked"}],purchase.id,"maturity")!,/linked movements/);
 assert.match(bondPurchaseRemovalIssue([],purchase.id,"maturity")!,/missing/);
});
