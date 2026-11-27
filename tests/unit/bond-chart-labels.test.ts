import test from "node:test";
import assert from "node:assert/strict";
import {bondChartLabels} from "../../src/modules/portfolio/presentation/bond-chart-labels";
test("bond labels use issuer/year and add months only for distinct same-year bonds",()=>{
 const one={assetId:"a",bondIssuer:"Morgan Stanley",maturityDate:"2030-04-12"};
 assert.equal(bondChartLabels([one,one]).get("a"),"Morgan Stanley 2030");
 const labels=bondChartLabels([one,{...one,assetId:"b",maturityDate:"2030-06-20"},{...one,assetId:"c",maturityDate:"2031-06-20"}]);
 assert.equal(labels.get("a"),"Morgan Stanley Apr 2030");
 assert.equal(labels.get("b"),"Morgan Stanley Jun 2030");
 assert.equal(labels.get("c"),"Morgan Stanley 2031");
 assert.equal(bondChartLabels([{assetId:"etf",maturityDate:null}]).size,0);
});
