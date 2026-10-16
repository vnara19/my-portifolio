import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeTicker, providerForQuote } from "@/modules/portfolio/domain/asset-kinds";
import { marketIdentity, marketAllocation } from "@/modules/portfolio/domain/market-assets";
import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { loadSymbolHistory } from "@/modules/quotes/application/symbol-history";
import { createVerifiedTickerToken, readVerifiedTickerToken } from "@/modules/quotes/application/verified-ticker-token";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const metadata = (name: string, instrumentType = "ETF", currency = "EUR") => ({ name, instrumentType, currency, exchange: "Xetra" });

test("market selection normalizes the exchange without guessing a European listing", () => {
  assert.equal(normalizeTicker("eu-market", "uetw.de"), "UETW.DE");
  assert.equal(normalizeTicker("eu-market", "UETW"), null);
  assert.equal(normalizeTicker("eu-market", "UETW.invalid"), null);
  assert.equal(normalizeTicker("br-market", "imab11"), "IMAB11.SAO");
  assert.equal(normalizeTicker("us-market", "voo"), "VOO");
  assert.equal(providerForQuote("EU_ETF", "USD"), "yahoo");
});
test("issuer references override incorrect wrapper metadata, not the trading currency", () => {
  assert.equal(marketIdentity("eu-market", "UETW.DE", metadata("UBS MSCI World UCITS ETF USD acc")).exposure, "equity");
  const gold = marketIdentity("eu-market", "EGLN.L", metadata("iShares Physical Gold ETC", "EQUITY"));
  assert.equal(gold.exposure, "commodity"); assert.equal(gold.currency, "EUR"); assert.equal(gold.instrumentType, "EU_ETC");
  assert.equal(marketIdentity("eu-market", "PPFD.SG", metadata("iShares Physical Silver ETC", "MUTUALFUND")).exposure, "commodity");
  assert.equal(marketIdentity("eu-market", "CSH2.PA", metadata("Amundi Smart Overnight Return UCITS ETF Acc")).exposure, "cash");
  assert.equal(marketIdentity("eu-market", "OTHER.L", metadata("Another Physical Gold ETC", "EQUITY")).exposure, null);
  assert.throws(() => marketIdentity("eu-market", "UETW.DE", metadata("Fund", "ETF", "USD")));
  assert.throws(() => marketIdentity("eu-market", "FUND.L", metadata("Fund", "ETF", "GBX")));
});
test("stock, FII, equity ETF and bond ETF classification depend on verified instrument identity", () => {
  const stock = marketIdentity("us-market", "AAPL", metadata("Apple Inc.", "EQUITY", "USD"));
  assert.equal(stock.assetType, "us-stock"); assert.equal(marketAllocation(stock)[0].assetClass, "Renda Variável");
  const voo = marketIdentity("us-market", "VOO", metadata("Vanguard S&P 500 ETF", "ETF", "USD"));
  assert.equal(voo.assetType, "us-etf"); assert.equal(voo.exposure, "equity");
  const bnd = marketIdentity("us-market", "BND", metadata("Vanguard Total Bond Market ETF", "ETF", "USD"));
  assert.equal(marketAllocation(bnd)[0].assetClass, "Renda Fixa");
  const imab = marketIdentity("br-market", "IMAB11.SAO", metadata("IT NOW IMA-B ETF", "ETF", "BRL"));
  assert.equal(imab.assetType, "br-etf"); assert.equal(imab.exposure, "bond");
  const fii = marketIdentity("br-market", "HGLG11.SAO", metadata("Cshg Logistica - Fundo De Investimento Imobiliario", "EQUITY", "BRL"));
  assert.equal(marketAllocation(fii)[0].subclass, "Imobiliário BR");
  assert.deepEqual(marketAllocation(marketIdentity("us-market", "ZZZ", metadata("Unknown ETF", "ETF", "USD"))), []);
});
test("signed listing identity cannot be relabeled to another currency by the browser", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const context = { userId: "a6d812eb-3a51-4f55-84df-0232092fcb56", monthId: "a7b96ee8-e75e-497c-9fa2-4321f19b7cb0", now };
  const identity = marketIdentity("eu-market", "UETW.DE", metadata("UBS Core MSCI World UCITS ETF USD acc"));
  const secret = "test-market-identity-not-an-environment-credential";
  const token = createVerifiedTickerToken({ symbol: "UETW.DE", kind: "eu-market", identity, status: "found", provider: "yahoo", priceBrl: 250, coinId: null, quoteDate: now, fetchedAt: now }, context, secret);
  assert.deepEqual(readVerifiedTickerToken(token, context, secret)?.identity, identity);
  const [payload, signature] = token.split("."); const claims = JSON.parse(Buffer.from(payload, "base64url").toString()); claims.identity.currency = "USD";
  assert.equal(readVerifiedTickerToken(`${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`, context, secret), null);
});

function chart(currency: string, day: string, price = 50) {
  const time = Date.parse(`${day}T12:00:00Z`) / 1000;
  return { chart: { error: null, result: [{ meta: { currency, regularMarketPrice: price, regularMarketTime: time, longName: "Test ETF", instrumentType: "ETF" }, timestamp: [time], indicators: { quote: [{ close: [price] }] } }] } };
}
test("European EUR and USD listings are converted to BRL and bypass Finnhub/B3 routing", async () => {
  globalThis.fetch = (async (raw) => {
    const url = String(raw);
    if (url.includes("finance/chart")) return Response.json(chart(url.includes("USD.L") ? "USD" : "EUR", "2026-10-15"));
    if (url.includes("frankfurter")) { const currency = url.includes("/USD/") ? "USD" : "EUR"; return Response.json({ date: "2026-10-15", base: currency, quote: "BRL", rate: currency === "USD" ? 5 : 6 }); }
    throw new Error(`Unexpected provider: ${url}`);
  }) as typeof fetch;
  const result = await fetchCurrentQuotes([{ symbol: "TEST.DE", instrumentType: "EU_ETF", baseCurrency: "EUR" }, { symbol: "USD.L", instrumentType: "EU_ETF", baseCurrency: "USD" }], {}, "2026-10-16");
  assert.deepEqual(result.map((quote) => quote.status === "SUCCESS" ? quote.valueBrl : null), [300, 250]);
  const [bad] = await fetchCurrentQuotes([{ symbol: "TEST.DE", instrumentType: "EU_ETF", baseCurrency: "USD" }], {}, "2026-10-16");
  assert.equal(bad.status, "FAILED");
});
test("European history uses historical EUR FX instead of storing EUR values as BRL", async () => {
  let saved: Array<{ valueBrl: { toNumber(): number } }> = [];
  globalThis.fetch = (async (raw) => {
    if (String(raw).includes("finance/chart")) return Response.json(chart("EUR", "2026-09-30"));
    return Response.json([{ date: "2026-09-30", base: "EUR", quote: "BRL", rate: 6 }]);
  }) as typeof fetch;
  const db = { dailyQuote: { createMany: async ({ data }: { data: typeof saved }) => { saved = data; return { count: data.length }; } } } as unknown as PrismaClient;
  await loadSymbolHistory(db, { symbol: "TEST.DE", instrumentType: "EU_ETF", baseCurrency: "EUR", providerId: null }, {
    months: ["2026-09"], currentMonth: new Date("2026-10-01T00:00:00Z"), now: new Date("2026-10-16T12:00:00Z"), configuration: {}, usdCache: { rates: null },
  });
  assert.equal(saved[0].valueBrl.toNumber(), 300);
});
