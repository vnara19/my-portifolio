import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { fetchJson } from "@/modules/quotes/infrastructure/http";


const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Reply = { status: number; body?: unknown } | "timeout";
type Routes = Record<string, Reply | Reply[]>;


function stubNetwork(routes: Routes) {
  const calls: string[] = [];

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((fragment) => url.includes(fragment));
    const entry = key ? routes[key] : { status: 404 };
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry;

    if (reply === "timeout") {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }

    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as typeof fetch;

  return calls;
}

const dollar = { "economia.awesomeapi.com.br": { status: 200, body: { USDBRL: { bid: "5.00" } } } };
const request = [{ symbol: "BTC", instrumentType: "CRIPTO", baseCurrency: "BTC" }];
const run = (symbols = request) => fetchCurrentQuotes(symbols, {}, "2026-10-07");

test("CoinGecko succeeds on retry without falling back", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com/api/v3/simple/price": [
      "timeout",
      { status: 200, body: { bitcoin: { brl: 415000 } } },
    ],
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "coingecko", status: "SUCCESS", valueBrl: 415000 });
  assert.equal(calls.filter((url) => url.includes("coingecko")).length, 2);
  assert.equal(calls.some((url) => url.includes("coinbase") || url.includes("binance")), false);
});

test("two failed CoinGecko attempts fall back to Coinbase in BRL", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com/v2/prices/BTC-BRL": { status: 200, body: { data: { amount: "416000.5", base: "BTC", currency: "BRL" } } },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "coinbase", status: "SUCCESS", valueBrl: 416000.5 });
  assert.equal(calls.filter((url) => url.includes("coingecko")).length, 2);
  assert.equal(calls.some((url) => url.includes("binance")), false);
});

test("without Coinbase, Yahoo quotes in USD and converts using the daily exchange rate", async () => {
  stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404, body: { message: "not found" } },
    "finance/chart/BTC-USD": {
      status: 200,
      body: { chart: { result: [{ meta: { currency: "USD", regularMarketPrice: 83000 }, indicators: { quote: [{}] } }], error: null } },
    },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "yahoo", status: "SUCCESS", valueBrl: 415000 });
});

test("Binance is the last fallback and HTTP 451 tries the market-data mirror", async () => {
  const calls = stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404 },
    "finance.yahoo.com": { status: 404 },
    "api.binance.com": { status: 451 },
    "data-api.binance.vision": { status: 200, body: { symbol: "BTCBRL", price: "417000.00" } },
  });
  const [btc] = await run();

  assert.deepEqual(btc, { symbol: "BTC", provider: "binance", status: "SUCCESS", valueBrl: 417000 });
  const order = ["coingecko", "coinbase", "yahoo", "binance.com", "binance.vision"].map((name) => calls.findIndex((url) => url.includes(name)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(order.every((index) => index >= 0), true);
});

test("when every provider fails, the error identifies each provider and explains HTTP 451", async () => {
  stubNetwork({
    ...dollar,
    "api.coingecko.com": "timeout",
    "api.coinbase.com": { status: 404 },
    "finance.yahoo.com": { status: 404 },
    "binance": { status: 451 },
  });
  const [btc] = await run();

  assert.equal(btc.status, "FAILED");
  if (btc.status === "FAILED") {
    assert.match(btc.errorMessage, /CoinGecko: The provider timed out\./);
    assert.match(btc.errorMessage, /Coinbase: Coinbase does not trade BTC in BRL\./);
    assert.match(btc.errorMessage, /Binance: The provider blocks the server region \(HTTP 451\)\./);
    assert.equal(btc.errorCode, "REGION_BLOCKED");
  }
});

test("provider rejections do not retry; server failures do", async () => {
  const limited = stubNetwork({ "provedor.test": { status: 429 } });
  await assert.rejects(fetchJson(new URL("https://provedor.test/x"), undefined, { attempts: 3 }));
  assert.equal(limited.length, 1);

  const flaky = stubNetwork({ "provedor.test": [{ status: 503 }, { status: 200, body: { ok: true } }] });
  assert.deepEqual(await fetchJson(new URL("https://provedor.test/x"), undefined, { attempts: 3 }), { ok: true });
  assert.equal(flaky.length, 2);
});
