import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { completedCloses } from "@/modules/quotes/domain/recent-closes";
import { refreshRecentDailyCloses } from "@/modules/quotes/application/recent-daily-closes";

test("completed sessions exclude live/future prices and retain dated conversion", () => {
  const result = completedCloses([{ day: "2026-10-29", value: 100 }, { day: "2026-10-30", value: 110 }, { day: "2026-10-31", value: 120 }], [{ day: "2026-10-29", rate: 5 }, { day: "2026-10-30", rate: 6 }], "USD", "2026-10-30");
  assert.deepEqual(result, [{ day: "2026-10-29", valueBrl: 500 }]);
  assert.throws(() => completedCloses([{ day: "2026-10-29", value: 100 }], [], "EUR", "2026-10-30"), /Missing dated/);
  assert.throws(() => completedCloses([{ day: "2026-10-29", value: 100 }], [{ day: "2026-10-01", rate: 5 }], "EUR", "2026-10-30"), /Missing dated/);
});

test("recent closing reconciliation touches only public daily prices, preserving manual observations", async () => {
  const statements: { sql: string; values: unknown[] }[] = [];
  let lookups = 0;
  const prisma = {
    dailyQuote: {
      findMany: async () => ++lookups === 1 ? [] : [{ symbol: "USD", quoteDate: new Date("2026-10-29"), valueBrl: new Prisma.Decimal(5) }],
      createMany: async () => ({ count: 0 }),
    },
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => { statements.push({ sql: parts.join("?"), values }); return 1; },
  } as unknown as PrismaClient;
  const result = await refreshRecentDailyCloses(prisma, [{ symbol: "BTC", instrumentType: "CRIPTO", baseCurrency: "USD" }], new Date("2026-10-30T20:00:00Z"), {
    loadFx: async () => [{ day: "2026-10-29", value: 5 }],
    loadPrices: async symbol => { assert.equal(symbol, "BTC-USD"); return { currency: "USD", points: [{ day: "2026-10-29", value: 77775 }, { day: "2026-10-30", value: 77000 }] }; },
  });
  assert.deepEqual(result, { updated: 1, failed: [] });
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /INSERT INTO "daily_quotes"/);
  assert.match(statements[0].sql, /NOT IN \('manual', 'spreadsheet'\)/);
  assert.equal(statements[0].values.some(v => Array.isArray(v) && v.includes("2026-10-30")), false);
  assert.equal(statements[0].values.some(v => Array.isArray(v) && v.includes("388875")), true);
});

test("already reconciled sessions do not fetch again, and wrong currencies never write prices", async () => {
  const target = { symbol: "FUND.DE", instrumentType: "EU_ETF", baseCurrency: "EUR" };
  const fail = async () => { throw new Error("Unexpected write or request"); };
  const current = { dailyQuote: { findMany: async () => [{ symbol: target.symbol }] }, $executeRaw: fail } as unknown as PrismaClient;
  assert.deepEqual(await refreshRecentDailyCloses(current, [target], new Date("2026-10-30"), { loadFx: fail, loadPrices: fail }), { updated: 0, failed: [] });
  const pending = { dailyQuote: { findMany: async () => [], createMany: async () => ({ count: 0 }) }, $executeRaw: fail } as unknown as PrismaClient;
  assert.deepEqual(await refreshRecentDailyCloses(pending, [target], new Date("2026-10-30"), { loadFx: async () => [], loadPrices: async () => ({ currency: "USD", points: [{ day: "2026-10-29", value: 100 }] }) }), { updated: 0, failed: [target.symbol] });
});
