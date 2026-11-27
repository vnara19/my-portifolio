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

test("USD and EUR prioritize the same reference source and crypto retains its native USD price", async()=>{
  const requests:string[]=[];
  globalThis.fetch=(async raw=>{
    const url=new URL(String(raw));requests.push(url.toString());
    if(url.pathname.includes('/rate/USD/BRL'))return Response.json({date:'2026-10-09',base:'USD',quote:'BRL',rate:5});
    if(url.pathname.includes('/rate/EUR/BRL'))return Response.json({...eur,rate:6});
    if(url.hostname.includes('coingecko')){
      assert.equal(url.searchParams.get('vs_currencies'),'usd');
      return Response.json({bitcoin:{usd:80000}});
    }
    throw new Error('Unexpected quote source');
  }) as typeof fetch;
  const results=await fetchCurrentQuotes([{symbol:'USD',instrumentType:'FIAT',baseCurrency:'USD'},{symbol:'EUR',instrumentType:'FIAT',baseCurrency:'EUR'},{symbol:'BTC',instrumentType:'CRIPTO',baseCurrency:'BTC'}],{},'2026-10-11');
  const usd=results.find(q=>q.symbol==='USD')!,btc=results.find(q=>q.symbol==='BTC')!;
  assert.equal(usd.provider,'frankfurter-ecb');
  assert.equal(usd.status,'SUCCESS');assert.equal(btc.status,'SUCCESS');
  if(usd.status==='SUCCESS'&&btc.status==='SUCCESS')assert.equal(btc.valueBrl/usd.valueBrl,80000);
  assert.ok(!requests.some(u=>u.includes('awesomeapi')));
});

test("Coinbase fallback also converts the native USD price using the stored FX reference",async()=>{
  globalThis.fetch=(async raw=>{
    const url=new URL(String(raw));
    if(url.hostname.includes('frankfurter'))return Response.json({date:'2026-10-09',base:'USD',quote:'BRL',rate:5});
    if(url.hostname.includes('coingecko'))return new Response('{}',{status:404});
    assert.ok(url.pathname.endsWith('/BTC-USD/spot'));
    return Response.json({data:{amount:'81000'}});
  }) as typeof fetch;
  const results=await fetchCurrentQuotes([{symbol:'BTC',instrumentType:'CRIPTO',baseCurrency:'BTC'}],{},'2026-10-11');
  assert.equal(results[0].provider,'coinbase');
  assert.equal(results[0].status,'SUCCESS');
  if(results[0].status==='SUCCESS')assert.equal(results[0].valueBrl,405000);
});
