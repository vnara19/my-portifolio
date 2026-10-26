/** Integration checks against the disposable schema and fictitious user only. */
import assert from "node:assert/strict";
import { exportBackup, restoreBackup } from "@/modules/backup/application/backup";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { applyMaturityExits, MATURITY_EXIT_NOTE } from "@/modules/portfolio/application/maturity-exits";
import { getOverviewData } from "@/modules/portfolio/application/get-overview-data";
import { getPortfolioGains } from "@/modules/portfolio/application/get-portfolio-gains";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { addPosition, undoChange } from "@/modules/portfolio/application/month-editing";
import { addTransaction } from "@/modules/portfolio/application/position-transactions";
import { isBusinessDay } from "@/modules/portfolio/domain/business-days";
import { calendarDay, currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "", /^english099_[a-f0-9]+$/);
  const db = getPrismaClient()!;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: "cash-test@portfolio.invalid" } });
    await runAsUser(user.id, async () => {
      await db.position.deleteMany({ where: { asset: { normalizedKey: { in: ["maturing-cdb", "ongoing-cdb"] } } } });
      await db.asset.deleteMany({ where: { normalizedKey: { in: ["maturing-cdb", "ongoing-cdb"] } } });
      const month = await db.portfolioMonth.findFirst({ where: { referenceDate: currentReferenceMonth() } }) ?? await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: currentReferenceMonth(), status: "DRAFT" } });
      const institution = await db.institution.findFirst({ where: { normalizedName: "portfolio" } }) ?? await db.institution.create({ data: { userId: user.id, name: "Portfolio", normalizedName: "portfolio" } });
      const account = await db.account.findFirst({ where: { institutionId: institution.id, name: "Main" } }) ?? await db.account.create({ data: { userId: user.id, institutionId: institution.id, name: "Main" } });
      const day = calendarDay(new Date());
      const start = new Date(day); start.setUTCDate(1);
      await db.rateCoverage.createMany({ data: [{ indexer: "CDI", fromDate: start, throughDate: day, fetchedAt: new Date() }], skipDuplicates: true });
      for (let cursor = new Date(start); cursor < day; cursor = new Date(+cursor + 86400000)) {
        if (isBusinessDay(toDateKey(cursor))) await db.rateObservation.upsert({ where: { indexer_date: { indexer: "CDI", date: cursor } }, create: { indexer: "CDI", date: cursor, dailyPercent: "0.04", source: "test", fetchedAt: new Date() }, update: { dailyPercent: "0.04" } });
      }
      await db.dailyQuote.createMany({ data: [start, day].map((quoteDate) => ({ symbol: "USD", quoteDate, instrumentType: "FIAT", baseCurrency: "USD", valueBrl: 5, provider: "test", fetchedAt: new Date() })), skipDuplicates: true });
      const create = async (key: string, maturity: Date | null, net: boolean) => {
        const asset = await db.asset.create({ data: { userId: user.id, name: key, normalizedKey: key, assetType: "fixed-income", baseCurrency: "BRL", maturityDate: maturity, appliedOn: start, autoIncome: true, fixedIncomeContract: { product: "CDB", issuer: "Test bank", indexer: net ? "CDI" : "PRE", rate: net ? "100" : "12", basis: "BUSINESS_252", taxMode: net ? "NET_BR" : "GROSS" } } });
        const row = await db.position.create({ data: { userId: user.id, portfolioMonthId: month.id, accountId: account.id, assetId: asset.id, openingQuantity: 0, quantity: 10000, totalBrl: 10000, calculationStartDate: start } });
        await db.positionAllocation.create({ data: { userId: user.id, positionId: row.id, assetClass: "Renda Fixa", subclass: net ? "Pós-fixado" : "Prefixado", duration: "-", weight: 1, ratePercent: net ? 100 : 12 } });
        await db.positionTransaction.create({ data: { userId: user.id, positionId: row.id, kind: "CONTRIBUTION", occurredOn: start, quantity: 10000, amountBrl: 10000 } });
        return row;
      };
      for (const balanceOnly of [true, false]) {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (raw) => {
          const url = new URL(String(raw)); assert.equal(url.hostname, "api.frankfurter.dev");
          return Response.json({ date: toDateKey(day), base: "USD", quote: "BRL", rate: 5 });
        };
        try {
          const added = await addPosition({ monthId: month.id, addition: { accountId: account.id, newAsset: { kind: "fixed-income", name: "Generated", ticker: null, maturityDate: null, manualPriceBrl: null, quoteCheckToken: null, appliedOn: toDateKey(day), fixedIncomeContract: { product: "CDB", issuer: balanceOnly ? "Manual audit" : "Net audit", indexer: "PRE", rate: "12", basis: "BUSINESS_252", taxMode: balanceOnly ? "GROSS" : "NET_BR", balanceOnly } }, value: "12345", strategy: null, allocations: [] } });
          const saved = await db.asset.findFirstOrThrow({ where: { fixedIncomeContract: { path: ["issuer"], equals: balanceOnly ? "Manual audit" : "Net audit" } } });
          assert.equal(saved.maturityDate, null);
          assert.equal(saved.autoIncome, !balanceOnly);
          const balance = await db.position.findFirstOrThrow({ where: { assetId: saved.id } });
          assert.equal(balance.totalBrl.toString(), "12345");
          await undoChange(added.undoToken);
        } finally { globalThis.fetch = originalFetch; }
      }
      const mature = await create("maturing-cdb", day, false);
      const ongoing = await create("ongoing-cdb", null, true);
      await valueCdiPositions(db, { where: { id: ongoing.id }, asOf: toDateKey(day) });
      const before = await db.position.findUniqueOrThrow({ where: { id: ongoing.id } });
      assert.ok(before.totalBrl.lt(before.quantity));
      await valueCdiPositions(db, { where: { id: mature.id }, asOf: toDateKey(day) });
      const gainBefore = await getPortfolioGains(month.referenceDate, 5);
      assert.notEqual(gainBefore.totalUsd, null);
      const withdrawal = await addTransaction({ monthId: month.id, transaction: { positionId: ongoing.id, kind: "WITHDRAWAL", occurredOn: toDateKey(day), amountBrl: "5000", quantity: null, unitPriceBrl: null } });
      const after = await db.position.findUniqueOrThrow({ where: { id: ongoing.id } });
      assert.ok(after.totalBrl.minus(before.totalBrl.minus(5000)).abs().lte("0.02"));
      const gainAfter = await getPortfolioGains(month.referenceDate, 5);
      assert.notEqual(gainAfter.totalUsd, null);
      assert.ok(Math.abs(gainAfter.totalUsd! - gainBefore.totalUsd!) <= 0.02);
      const entry = await db.positionTransaction.findFirstOrThrow({ where: { positionId: ongoing.id, kind: "WITHDRAWAL" } });
      assert.match(entry.note!, /^Net withdrawal: BRL 5000.00;/);
      assert.ok(entry.quantity.lt(5000));
      await undoChange(withdrawal.undoToken);
      assert.equal((await db.position.findUniqueOrThrow({ where: { id: ongoing.id } })).totalBrl.toString(), before.totalBrl.toString());
      await applyMaturityExits(day);
      await applyMaturityExits(day);
      assert.equal((await db.position.findUniqueOrThrow({ where: { id: mature.id } })).quantity.toString(), "0");
      assert.ok((await db.position.findUniqueOrThrow({ where: { id: ongoing.id } })).quantity.gt(0));
      assert.equal(await db.positionTransaction.count({ where: { note: MATURITY_EXIT_NOTE } }), 1);
      assert.equal(await db.asset.count({ where: { assetType: { in: ["brl-cash", "usd-balance", "eur-balance"] } } }), 0);
      await assert.rejects(addPosition({ monthId: month.id, addition: { accountId: account.id, newAsset: { kind: "brl-cash", name: "Cash", ticker: null, maturityDate: null, manualPriceBrl: null, quoteCheckToken: null }, value: "100", strategy: null, allocations: [] } }), /Cash-only/);
      const full = await db.position.findUniqueOrThrow({ where: { id: ongoing.id } });
      await addTransaction({ monthId: month.id, transaction: { positionId: ongoing.id, kind: "WITHDRAWAL", occurredOn: toDateKey(day), amountBrl: full.totalBrl.toFixed(2), quantity: null, unitPriceBrl: null } });
      assert.equal((await db.position.findUniqueOrThrow({ where: { id: ongoing.id } })).totalBrl.toString(), "0");
      const closedGains = await getPortfolioGains(month.referenceDate, 5);
      assert.notEqual(closedGains.totalUsd, null);
      assert.ok(Math.abs(closedGains.totalUsd! - gainBefore.totalUsd!) <= 0.02);
      const emptyOverview = await getOverviewData(month.referenceDate);
      assert.ok(emptyOverview);
      assert.equal(emptyOverview.totalBrl, 0);
      assert.notEqual(emptyOverview.gains.totalUsd, null);
      const backup = await exportBackup();
      assert.ok(backup);
      await restoreBackup(backup);
      const restored = await db.asset.findUniqueOrThrow({ where: { id: ongoing.assetId } });
      assert.equal((restored.fixedIncomeContract as { taxMode: string }).taxMode, "NET_BR");
      assert.equal(await db.positionTransaction.count({ where: { note: MATURITY_EXIT_NOTE } }), 1);
      console.log("Net partial/full withdrawals, Undo, maturity idempotency, no cash creation, ongoing reserves and cash-entry rejection passed.");
    });
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
