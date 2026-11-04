import test from "node:test";
import assert from "node:assert/strict";
import {purchaseCost,treasuryUnitPriceFromTotal} from "../../src/modules/portfolio/domain/purchase-cost";
test("treasury total investment derives price and preserves exact principal despite rounding",()=>{
 const price=treasuryUnitPriceFromTotal("10000.01","81");
 assert.equal(price,"123.45691358");
 const cost=purchaseCost("81",price,"0",1,"BUY","10000.01");
 assert.equal(cost.nativeCost.toFixed(),"10000.01");
 assert.equal(cost.amountBrl.toFixed(),"10000.01");
 assert.equal(treasuryUnitPriceFromTotal("153.32","0.01"),"15332");
});
test("treasury totals reject missing, zero, negative and sub-cent amounts",()=>{
 for(const total of ["","0","-1","10.001"]) assert.throws(()=>treasuryUnitPriceFromTotal(total,"81"));
 assert.throws(()=>treasuryUnitPriceFromTotal("100","0"));
});
