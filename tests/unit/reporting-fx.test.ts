import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { fetchReferenceFxHistory, fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const eur = { date: "2026-10-09", base: "EUR", quote: "BRL", rate: 6.2 };

test("EUR uses an unauthenticated daily reference rate and retains its date", async () => {
  globalThis.fetch = (async (url, options) => {
    assert.match(String(url), /providers\/ecb\/rate\/EUR\/BRL/);
    assert.equal(new URL(String(url)).searchParams.get("date"), "2026-10-11");
    assert.equal(options?.headers, undefined);
    return Response.json(eur);
  }) as typeof fetch;
  assert.deepEqual(await fetchCurrentQuotes([{ symbol: "EUR", instrumentType: "FIAT", baseCurrency: "EUR" }], {}, "2026-10-11"),
    [{ symbol: "EUR", provider: "frankfurter-ecb", status: "SUCCESS", valueBrl: 6.2, quoteDate: "2026-10-09" }]);
});

test("FX responses must match the requested pair and cannot be future dated", async () => {
  for (const invalid of [{ ...eur, base: "USD" }, { ...eur, quote: "USD" }, { ...eur, date: "2026-10-12" }, { ...eur, date: "2026-02-31" }, { ...eur, rate: 0 }]) {
    globalThis.fetch = (async () => Response.json(invalid)) as typeof fetch;
    await assert.rejects(fetchReferenceFxLatest("EUR", "2026-10-11"));
  }
});

test("historical FX requests are bounded and preserve observations rather than current prices", async () => {
  globalThis.fetch = (async (url) => {
    const query = new URL(String(url));
    assert.equal(query.searchParams.get("base"), "EUR");
    assert.equal(query.searchParams.get("from"), "2026-09-01");
    assert.equal(query.searchParams.get("to"), "2026-09-30");
    return Response.json([{ ...eur, date: "2026-09-29", rate: 6.1 }, { ...eur, date: "2026-09-30", rate: 6.15 }]);
  }) as typeof fetch;
  assert.deepEqual(await fetchReferenceFxHistory("EUR", "2026-09-01", "2026-09-30"), [{ day: "2026-09-29", value: 6.1 }, { day: "2026-09-30", value: 6.15 }]);
});

test("EUR falls back to Yahoo when the reference-rate source is unavailable", async () => {
  globalThis.fetch = (async (url) => String(url).includes("frankfurter") ? new Response("{}", { status: 503 }) :
    Response.json({ chart: { result: [{ meta: { regularMarketPrice: 6.3, currency: "BRL" }, indicators: { quote: [{ close: [] }] } }], error: null } })) as typeof fetch;
  const [quote] = await fetchCurrentQuotes([{ symbol: "EUR", instrumentType: "FIAT", baseCurrency: "EUR" }], {}, "2026-10-11");
  assert.equal(quote.status, "SUCCESS");
  if (quote.status === "SUCCESS") { assert.equal(quote.valueBrl, 6.3); assert.equal(quote.provider, "yahoo"); }
});
