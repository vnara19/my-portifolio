import test from "node:test";
import assert from "node:assert/strict";
import { visibleMonthQuoteSymbols } from "../../src/modules/quotes/domain/active-quote-usage";
test("current quote list excludes sold-out stored symbols and retains reporting FX",()=>{
 const stored=["PPFD.SG","EGLN.L","USD","EUR"];
 assert.deepEqual(visibleMonthQuoteSymbols({activeSymbols:["EGLN.L"],storedSymbols:stored,isCurrent:true}),["USD","EUR","BTC","EGLN.L"]);
 // Reopening the position restores its live quote without registry deletion/recreation.
 assert.deepEqual(visibleMonthQuoteSymbols({activeSymbols:["EGLN.L","PPFD.SG"],storedSymbols:stored,isCurrent:true}),["USD","EUR","BTC","EGLN.L","PPFD.SG"]);
 assert.deepEqual(stored,["PPFD.SG","EGLN.L","USD","EUR"]);
});
test("historical quotes remain available after the position is closed",()=>{
 assert.deepEqual(visibleMonthQuoteSymbols({activeSymbols:[],storedSymbols:["PPFD.SG"],isCurrent:false}),["USD","EUR","BTC","PPFD.SG"]);
 assert.deepEqual(visibleMonthQuoteSymbols({activeSymbols:["UETW.DE","UETW.DE"],storedSymbols:[],isCurrent:true}),["USD","EUR","BTC","UETW.DE"]);
});
