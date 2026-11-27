import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { preferredEuroListing, resolveEuropeanTicker } from "@/modules/quotes/application/european-listing";
import { marketIdentity, marketAllocation } from "@/modules/portfolio/domain/market-assets";
import { classifyFundName } from "@/modules/portfolio/domain/fund-classification";

const listing = (symbol: string, currency: string, name = "Vanguard S&P 500 UCITS ETF USD Accumulation") => ({ symbol, currency, name, exchange: symbol.split(".")[1] });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("EUR preference verifies trading currency and prefers Xetra over provider result order", () => {
  assert.equal(preferredEuroListing([listing("VUAA.L", "USD"), listing("VUAA.MI", "EUR"), listing("VUAA.DE", "EUR"), listing("VUAA.MU", "EUR", "Truncated venue name")])?.symbol, "VUAA.DE");
  assert.equal(preferredEuroListing([listing("VUAA.DE", "USD"), listing("VUAA.MI", "EUR")])?.symbol, "VUAA.MI");
  assert.equal(preferredEuroListing([listing("FUND.L", "GBp"), listing("FUND.DE", "USD")]), null);
  assert.equal(preferredEuroListing([listing("CSH2.PA", "EUR")])?.symbol, "CSH2.PA");
});
test("different EUR products remain a choice instead of silently selecting a share class", () => {
  assert.equal(preferredEuroListing([listing("ABC.DE", "EUR", "Fund World Accumulating"), listing("ABC.MI", "EUR", "Fund World Distributing")]), null);
});
test("resolver ignores partial ticker matches, tolerates one failed venue and caches public search", async () => {
  let searches = 0;
  globalThis.fetch = async (raw) => {
    const url = String(raw);
    if (url.includes("finance/search")) { searches++; return Response.json({ quotes: [
      { symbol: "EURTEST.L", longname: "Fund S&P 500", quoteType: "ETF" },
      { symbol: "EURTEST.DE", longname: "Fund S&P 500", quoteType: "ETF" },
      { symbol: "EURTEST.MU", longname: "Fund S&P 500", quoteType: "ETF" },
      { symbol: "EURTESTOTHER.DE", longname: "Different Fund", quoteType: "ETF" },
    ] }); }
    if (url.includes("EURTEST.MU")) throw new Error("Venue unavailable");
    assert.equal(url.includes("EURTESTOTHER"), false);
    return Response.json({ chart: { result: [{ meta: { longName: "Fund S&P 500", currency: url.includes("EURTEST.L") ? "USD" : "EUR", regularMarketPrice: 50 }, indicators: { quote: [] } }] } });
  };
  const first = await resolveEuropeanTicker("EURTEST");
  assert.equal(first.preferred?.symbol, "EURTEST.DE");
  assert.deepEqual(first.listings.map((item) => item.currency), ["EUR", "USD"]);
  await resolveEuropeanTicker("EURTEST");
  assert.equal(searches, 1);
});
test("the reported ETFs classify as equities across listings, including truncated names", () => {
  for (const [symbol, name] of [
    ["EXUS.DE", "Xtrackers MSCI World ex USA UCITS ETF 1C USD"],
    ["VUAA.DE", "Vanguard S&P 500 UCITS ETF USD Accumulation"],
    ["XMEU.MU", "Xtrackers MSCI Europe I"],
    ["V50A.DE", "Amundi Core EURO STOXX 50 UCITS ETF EUR Acc"],
    ["VWCE.AS", "Vanguard FTSE All-World UCITS ETF USD Accumulation"],
  ]) {
    const identity = marketIdentity("eu-market", symbol, { name, currency: "EUR", instrumentType: "ETF", exchange: "Test" });
    assert.equal(identity.exposure, "equity", symbol);
    assert.equal(marketAllocation(identity)[0].assetClass, "Renda Variável");
  }
});
test("fund descriptions distinguish bonds, money market, commodities and mixed portfolios", () => {
  assert.equal(classifyFundName("iShares MSCI World Corporate Bond UCITS ETF")?.exposure, "bond");
  assert.equal(classifyFundName("Amundi Smart Overnight Return UCITS ETF Acc")?.exposure, "cash");
  assert.equal(classifyFundName("iShares Physical Gold ETC")?.exposure, "commodity");
  assert.equal(classifyFundName("Unknown UCITS ETF"), null);
  assert.equal(classifyFundName("Global Multi-Asset Equity and Bond ETF"), null);
  assert.equal(classifyFundName("S&P 500 Covered Call UCITS ETF"), null);
  assert.equal(classifyFundName("MSCI World Convertible Bond ETF"), null);
});
