import {test} from "node:test";
import assert from "node:assert/strict";
import {fetchYahooSnapshot} from "../../src/modules/quotes/infrastructure/yahoo";

test("market snapshot compares with the prior session, not the beginning of its five-day range",async()=>{
 const original=globalThis.fetch;
 const stamp=(day:string)=>Date.parse(`${day}T19:00:00Z`)/1000;
 globalThis.fetch=async()=>new Response(JSON.stringify({chart:{result:[{meta:{currency:"USD",regularMarketPrice:125,regularMarketTime:stamp("2026-10-30"),exchangeTimezoneName:"America/New_York"},timestamp:[stamp("2026-10-28"),stamp("2026-10-29"),stamp("2026-10-30")],indicators:{quote:[{close:[100,120,124]}]}}],error:null}}));
 try{const quote=await fetchYahooSnapshot("^GSPC");assert.equal(quote.price,125);assert.equal(quote.previous,120);assert.equal(quote.previousDay,"2026-10-29");assert.equal(quote.day,"2026-10-30");}
 finally{globalThis.fetch=original;}
});
