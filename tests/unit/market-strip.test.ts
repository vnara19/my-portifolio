import {test} from "node:test";
import assert from "node:assert/strict";
import {quoteChange} from "../../src/modules/quotes/domain/market-change";
test("quote changes use the previous observation, including a falling policy rate",()=>{
 assert.ok(Math.abs(quoteChange(110,100)!-10)<1e-8);
 assert.ok(Math.abs(quoteChange(13.75,14)!+1.78571428571429)<1e-8);
 assert.equal(quoteChange(100,100),0);
 for(const [current,previous] of [[null,2],[2,null],[2,0],[NaN,1],[2,Infinity]])assert.equal(quoteChange(current,previous),null);
});
