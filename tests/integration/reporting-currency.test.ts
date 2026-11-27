import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { getOverviewData } from "@/modules/portfolio/application/get-overview-data";
import { getMonthQuotes } from "@/modules/quotes/application/get-month-quotes";
import { syncQuotes } from "@/modules/quotes/application/sync-quotes";

const isolated = /^(english099|reporting100)_[a-f0-9]+$/.test(databaseSchema(process.env.DATABASE_URL ?? "") ?? "");

test("reporting FX is registered without FX positions, backfilled and used in USD comparisons", { skip: !isolated }, async () => {
  const prisma = getPrismaClient()!;
  const originalFetch = globalThis.fetch;
  const userId = randomUUID();
  const now = new Date("2026-10-14T12:00:00Z");
  const current = new Date("2026-10-01T00:00:00Z");
  const previous = new Date("2026-09-01T00:00:00Z");
  try {
    // This suite owns a disposable schema; reset shared FX fixtures for repeatability.
    await prisma.dailyQuote.deleteMany({ where: { symbol: { in: ["USD", "EUR"] } } });
    await prisma.marketQuote.deleteMany({ where: { symbol: { in: ["USD", "EUR"] } } });
    await prisma.quoteSymbol.deleteMany({ where: { symbol: { in: ["USD", "EUR"] } } });
    await prisma.user.create({ data: { id: userId, name: "Currency integration", email: `${userId}@portfolio.invalid` } });
    const institution = await prisma.institution.create({ data: { userId, name: "Test broker", normalizedName: "test broker" } });
    const account = await prisma.account.create({ data: { userId, institutionId: institution.id, name: "Investment account" } });
    const asset = await prisma.asset.create({ data: { userId, name: "Savings bond", normalizedKey: "savings", assetType: "fixed-income", baseCurrency: "BRL" } });
    for (const referenceDate of [previous, current]) {
      const month = await prisma.portfolioMonth.create({ data: { userId, referenceDate, status: "DRAFT" } });
      const position = await prisma.position.create({ data: { userId, portfolioMonthId: month.id, accountId: account.id, assetId: asset.id, quantity: "1000", openingQuantity: "1000", totalBrl: "1000" } });
      await prisma.positionAllocation.create({ data: { userId, positionId: position.id, assetClass: "Renda Fixa", subclass: "Prefixado", duration: "Curto", weight: "1" } });
    }
    await prisma.marketQuote.create({ data: { referenceDate: previous, symbol: "USD", instrumentType: "FIAT", baseCurrency: "USD", valueBrl: "5", quoteDate: new Date("2026-09-30T00:00:00Z") } });
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      assert.match(url.hostname, /frankfurter/);
      const base = url.searchParams.get("base")!;
      const start = new Date(`${url.searchParams.get("from")}T00:00:00Z`);
      const until = url.searchParams.get("to")!;
      const points = [];
      while (start.toISOString().slice(0, 10) <= until) {
        const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        points.push({ date: day.toISOString().slice(0, 10), base, quote: "BRL", rate: base === "EUR" ? 6 : 4.8 });
        start.setUTCMonth(start.getUTCMonth() + 1);
      }
      return Response.json(points);
    }) as typeof fetch;
    const outcome = await syncQuotes({ prisma, now,
      fetchQuotes: async (requests) => {
        assert.deepEqual(requests.map((request) => request.symbol).sort(), ["EUR", "USD"]);
        return requests.map((request) => ({ symbol: request.symbol, provider: "fixture", status: "SUCCESS", valueBrl: request.symbol === "USD" ? 4 : 6.2, quoteDate: "2026-10-14" }));
      },
      fetchSelicRate: async () => ({ source: "fixture", observations: [{ observedOn: "2026-10-14", percentAnnual: "13.75" }] }),
      fetchCdiRates: async () => [],
    });
    assert.equal(outcome.state, "done");
    if (outcome.state === "done") { assert.deepEqual(outcome.failed, []); assert.ok(outcome.histories.every((history) => history.status !== "FAILED")); }
    await runAsUser(userId, async () => {
      const overview = await getOverviewData(current);
      assert.ok(overview);
      assert.equal(overview.totalBrl, 1000); assert.equal(overview.reporting.total.USD, 250);
      assert.equal(overview.reporting.monthly.percentUsd, 25); assert.equal(overview.reporting.monthly.amounts?.BRL, 0);
      assert.ok(overview.reporting.monthly.amounts!.EUR! < 0);
      assert.equal(overview.reporting.annual.amounts, null);
      const quotes = await getMonthQuotes(current);
      assert.deepEqual(quotes?.quotes.map((quote) => quote.symbol), ["USD", "EUR"]);
    });
    const preserved = await prisma.marketQuote.findFirstOrThrow({ where: { symbol: "USD", referenceDate: previous } });
    assert.equal(preserved.valueBrl.toString(), "5");
    const monthEndEur = await prisma.marketQuote.findFirstOrThrow({ where: { symbol: "EUR", referenceDate: previous } });
    assert.equal(monthEndEur.valueBrl.toString(), "6");
    assert.equal(monthEndEur.quoteDate?.toISOString().slice(0, 10), "2026-09-30");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.position.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
