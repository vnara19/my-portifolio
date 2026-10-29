import assert from "node:assert/strict";
import { test } from "node:test";
import { yahooQuoteDay } from "@/modules/quotes/infrastructure/yahoo";
test("crypto midnight UTC is not moved to the prior Brazilian date",()=>{
 assert.equal(yahooQuoteDay(Date.parse("2026-10-29T00:00:00Z")/1000,"UTC"),"2026-10-29");
 assert.equal(yahooQuoteDay(Date.parse("2026-10-29T00:00:00Z")/1000,undefined),"2026-10-29");
});
test("exchange sessions retain their local trading date",()=>{
 assert.equal(yahooQuoteDay(Date.parse("2026-10-29T20:00:00Z")/1000,"America/New_York"),"2026-10-29");
 assert.equal(yahooQuoteDay(Date.parse("2026-10-28T23:30:00Z")/1000,"Europe/Berlin"),"2026-10-29");
});
