import assert from "node:assert/strict";
import { test } from "node:test";
import { searchEuropeanListings } from "../../src/modules/quotes/infrastructure/yahoo";
import { tickerCheckAllowsSaving } from "../../src/modules/quotes/domain/ticker-check";

test("European ticker search uses the provider catalog and filters unrelated markets", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("q"), "NEWFUND");
    return new Response(JSON.stringify({ quotes: [
      { symbol: "NEWFUND.DE", longname: "New European Fund", exchDisp: "XETRA", quoteType: "ETF" },
      { symbol: "NEWFUND.PA", shortname: "Another listing", exchDisp: "Paris", quoteType: "ETF" },
      { symbol: "NEWFUND.DE", quoteType: "ETF" },
      { symbol: "NEWFUND", quoteType: "ETF" },
      { symbol: "NEWFUND.SA", quoteType: "EQUITY" },
      { symbol: "NEWFUND.DE", quoteType: "INDEX" },
    ] }));
  };
  try {
    const listings = await searchEuropeanListings("NEWFUND");
    assert.deepEqual(listings.map((item) => item.symbol), ["NEWFUND.DE", "NEWFUND.PA"]);
    assert.equal(listings[0].name, "New European Fund");
    assert.equal(tickerCheckAllowsSaving({ status: "matches", listings }), false);
  } finally { globalThis.fetch = original; }
});
