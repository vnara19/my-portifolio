import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchCurrentQuotes } from "@/modules/quotes/application/fetch-current-quotes";
import { syncQuotes } from "@/modules/quotes/application/sync-quotes";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  getTreasuryCatalog,
  parseTreasuryCsv,
  treasuryMonthEndPoints,
  treasuryProviderId,
  treasurySeriesOf,
  treasurySymbol,
} from "@/modules/quotes/domain/treasury";
import { createTreasurySource, fetchTreasuryQuotes, TREASURY_CSV_URL } from "@/modules/quotes/infrastructure/treasury";

const header = "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha";
const fixture = `${header}\nTesouro IPCA+;15/05/2035;02/10/2026;7,10;7,22;1.500,00;1.480,00;1.479,25\nTesouro IPCA+;15/08/2035;02/10/2026;7,10;7,22;1.600,00;1.580,00;1.579,25\nTesouro IPCA+;15/05/2035;30/09/2026;7,10;7,22;1.450,00;1.430,00;1.429,25\nTesouro IPCA+;15/05/2035;31/08/2026;7,10;7,22;1.400,00;1.380,00;1.379,25\nTesouro Prefixado com Juros Semestrais;01/01/2033;02/10/2026;13,0;13,1;1.000,00;990,00;989,50\nTesouro Prefixado;01/01/2026;31/12/2025;13,0;13,1;1.000,00;990,00;989,50\nTesouro Selic;01/03/2031;02/10/2026;0,1;0,2;20.100,00;20.000,00;0,00\n`;
const identity = {
  symbol: treasurySymbol("Tesouro IPCA+", "2035-05-15"),
  providerId: treasuryProviderId("Tesouro IPCA+", "2035-05-15"),
  instrumentType: "TESOURO",
  baseCurrency: "BRL",
};

test("official base price distinguishes securities with different maturities in the same year", () => {
  const book = parseTreasuryCsv(`\uFEFF${fixture.replace(/\n/g, "\r\n")}`);
  const bonds = getTreasuryCatalog(book, "2026-10-04");
  assert.equal(bonds.length, 3);
  assert.equal(bonds.find((bond) => bond.symbol === identity.symbol)?.valueBrl, 1479.25);
  assert.notEqual(identity.symbol, treasurySymbol("Tesouro IPCA+", "2035-08-15"));
  assert.equal(bonds.find((bond) => bond.symbol === identity.symbol)?.providerId, "Tesouro IPCA+|2035-05-15");
  assert.equal(bonds.some((bond) => bond.type.includes("Juros Semestrais")), true);
  assert.equal(bonds.some((bond) => bond.maturityDate <= "2026-10-04"), false);
  assert.equal(bonds.some((bond) => bond.type === "Tesouro Selic"), false);
});

test("delayed queries retain official dates and historical queries do not use future prices", async () => {
  const loadBook = async () => parseTreasuryCsv(fixture);
  const [now] = await fetchTreasuryQuotes([identity], { today: "2026-10-04", loadBook });
  assert.deepEqual(now, { symbol: identity.symbol, provider: "tesouro", status: "SUCCESS", valueBrl: 1479.25, quoteDate: "2026-10-02" });
  const [past] = await fetchTreasuryQuotes([identity], { today: "2026-10-01", loadBook });
  assert.equal(past.status, "SUCCESS");
  if (past.status === "SUCCESS") assert.equal(past.quoteDate, "2026-09-30");
});

test("conflicting identifiers, missing and matured securities fail without substitute prices", async () => {
  const loadBook = async () => parseTreasuryCsv(fixture);
  const results = await fetchTreasuryQuotes([
    { ...identity, providerId: treasuryProviderId("Tesouro IPCA+", "2035-08-15") },
    { ...identity, symbol: "TD:INEXISTENTE:2030-01-01", providerId: undefined },
    { ...identity, symbol: treasurySymbol("Tesouro Prefixado", "2026-01-01"), providerId: undefined },
  ], { today: "2026-10-04", loadBook });
  assert.deepEqual(results.map((result) => result.status === "FAILED" && result.errorCode), ["NOT_FOUND", "NOT_FOUND", "MATURED_TITLE"]);
  assert.equal(results.some((result) => "valueBrl" in result), false);
});

test("source failures do not create prices and a later load can recover", async () => {
  let calls = 0;
  const loadBook = createTreasurySource(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("offline");
    return fixture;
  });
  const [failure] = await fetchTreasuryQuotes([identity], { today: "2026-10-04", loadBook });
  assert.equal(failure.status, "FAILED");
  if (failure.status === "FAILED") assert.equal(failure.errorCode, "NETWORK_ERROR");
  const [success] = await fetchTreasuryQuotes([identity], { today: "2026-10-04", loadBook });
  assert.equal(success.status, "SUCCESS");
  assert.equal(calls, 2);
});

test("catalog, prices and history share a concurrent cache that expires after an hour", async () => {
  let clock = 100;
  let calls = 0;
  const loadBook = createTreasurySource(async () => { calls += 1; return fixture; }, () => clock);
  const [one, two] = await Promise.all([loadBook(), loadBook()]);
  assert.equal(one, two);
  assert.equal(calls, 1);
  await loadBook();
  assert.equal(calls, 1);
  clock += 60 * 60 * 1000 + 1;
  await loadBook();
  assert.equal(calls, 2);
});

test("history stores observed closes and rejects gaps within coverage", () => {
  const book = parseTreasuryCsv(fixture);
  const series = treasurySeriesOf(book, identity)!;
  const closes = treasuryMonthEndPoints(series, ["2026-07", "2026-08", "2026-09"], "2026-10");
  assert.equal(closes.size, 2);
  assert.equal(closes.get("2026-09")?.day, "2026-09-30");
  const gap = { ...series, points: series.points.filter((point) => !point.day.startsWith("2026-09")) };
  assert.throws(() => treasuryMonthEndPoints(gap, ["2026-08", "2026-09"], "2026-10"), /2026-09/);
});

test("changed columns, impossible dates, partial files and invalid base prices are rejected", () => {
  assert.throws(() => parseTreasuryCsv(fixture.replace("PU Base Manha", "PU Venda")), /columns/);
  assert.throws(() => parseTreasuryCsv(fixture.replace("02/10/2026", "31/02/2026")), /invalid date/);
  assert.throws(() => parseTreasuryCsv(`${header}\nTesouro IPCA+;15/05/2035\n`), /incomplete row/);
  assert.throws(() => parseTreasuryCsv(fixture.replace("1.479,25", "unavailable")), /invalid price/);
  assert.throws(() => parseTreasuryCsv(`${header}\n"incompleto`), /incomplete/);
});

test("Tesouro Direto assets use only the official provider and its quote date", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(fixture, { status: 200 });
  };
  try {
    const [result] = await fetchCurrentQuotes([identity], {}, "2026-10-04");
    assert.deepEqual(urls, [TREASURY_CSV_URL]);
    assert.equal(result.status, "SUCCESS");
    if (result.status === "SUCCESS") assert.equal(result.quoteDate, "2026-10-02");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function syncFixture() {
  const raw: { sql: string; values: unknown[] }[] = [];
  const results: { status: string; errorCode: string | null }[] = [];
  const symbol = {
    ...identity,
    status: "PENDING",
    lastSuccessAt: null,
    nextAttemptAt: null,
    failureCount: 0,
    historySyncedUntil: new Date("2026-09-01T00:00:00Z"),
  };
  const client = {
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => { raw.push({ sql: parts.join("?"), values }); return 0; },
    portfolioMonth: { findMany: async () => [{ id: "month", referenceDate: new Date("2026-10-01T00:00:00Z") }] },
    position: { findMany: async () => [{ asset: { quoteSymbol: identity.symbol } }] },
    quoteSymbol: { findMany: async () => [symbol, ...["USD", "EUR"].map((currency) => ({
      ...symbol, symbol: currency, instrumentType: "FIAT", baseCurrency: currency,
      lastSuccessAt: new Date("2026-10-04T15:00:00Z"), historyAttemptedAt: new Date("2026-10-04T15:00:00Z"),
    }))], updateMany: async () => ({}), update: async () => ({}) },
    quoteRefreshRun: { updateMany: async () => ({}), findFirst: async () => null, create: async () => ({ id: "run" }), update: async () => ({}) },
    quoteRefreshResult: { createMany: async ({ data }: { data: typeof results }) => { results.push(...data); return { count: data.length }; } },
    manualQuote: { deleteMany: async () => ({}) },
  };
  const prisma = { ...client, $transaction: async (run: (transaction: typeof client) => Promise<unknown>) => run(client) } as unknown as PrismaClient;
  return { prisma, raw, results };
}

test("the job persists official dates per symbol and reprices accepted monthly quotes", async () => {
  const fixture = syncFixture();
  const result = await syncQuotes({
    prisma: fixture.prisma,
    now: new Date("2026-10-04T15:00:00Z"),
    fetchQuotes: async () => [{ symbol: identity.symbol, provider: "tesouro", status: "SUCCESS", valueBrl: 1479.25, quoteDate: "2026-10-02" }],
  });
  assert.equal(result.state, "done");
  for (const table of ["daily_quotes", "market_quotes"]) {
    const insert = fixture.raw.find((query) => query.sql.includes(`INSERT INTO "${table}"`));
    assert.ok(insert);
    assert.equal(insert.values.some((value) => Array.isArray(value) && value.includes("2026-10-02")), true);
    assert.equal(insert.values.includes("2026-10-04"), false);
  }
  const monthly = fixture.raw.find((query) => query.sql.includes('INSERT INTO "market_quotes"'))!;
  assert.match(monthly.sql, /EXCLUDED\."quote_date" >= "market_quotes"\."quote_date"/);
  const positions = fixture.raw.find((query) => query.sql.includes('UPDATE "positions"'))!;
  assert.match(positions.sql, /"q"\."value_brl"/);
});

test("the job rejects impossible or future dates without writing invalid prices", async () => {
  for (const quoteDate of ["2026-10-05", "2026-02-31"]) {
    const fixture = syncFixture();
    const result = await syncQuotes({
      prisma: fixture.prisma,
      now: new Date("2026-10-04T15:00:00Z"),
      fetchQuotes: async () => [{ symbol: identity.symbol, provider: "tesouro", status: "SUCCESS", valueBrl: 1479.25, quoteDate }],
    });
    assert.equal(result.state, "done");
    assert.deepEqual(fixture.results.map((entry) => entry.errorCode), ["INVALID_DATE"]);
    assert.equal(fixture.raw.some((query) => query.sql.includes('INSERT INTO "daily_quotes"')), false);
    assert.equal(fixture.raw.some((query) => query.sql.includes('UPDATE "positions"')), false);
  }
});
