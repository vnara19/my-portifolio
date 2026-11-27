import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { addPosition, undoChange } from "@/modules/portfolio/application/month-editing";
import { updateTransaction } from "@/modules/portfolio/application/position-transactions";
import { addMonths, currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";

const isolated = /^english099_[a-f0-9]+$/.test(process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "" : "");

test("fixed-income purchases reuse the stored fixing and date corrections rebuild monthly history with undo", { skip: !isolated }, async () => {
  const db = getPrismaClient()!;
  const user = await db.user.create({ data: { name: "Fixed Income Test", email: `${randomUUID()}@portfolio.invalid` } });
  const originalFetch = globalThis.fetch;
  const currentDate = currentReferenceMonth();
  const sourceDay = toDateKey(addMonths(currentDate, -2));
  const earlierDay = toDateKey(addMonths(currentDate, -3));
  const maturityDate = toDateKey(addMonths(currentDate, 8));
  try {
    await db.dailyQuote.createMany({ data: [sourceDay, earlierDay].map(day => ({
      symbol: "USD", quoteDate: new Date(day), instrumentType: "FIAT", baseCurrency: "USD", valueBrl: 5, provider: "test", fetchedAt: new Date(),
    })), skipDuplicates: true });
    globalThis.fetch = async () => { throw new Error("Provider unavailable"); };
    await runAsUser(user.id, async () => {
      const month = await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: currentDate } });
      const bank = await db.institution.create({ data: { userId: user.id, name: "Portfolio", normalizedName: "portfolio" } });
      const account = await db.account.create({ data: { userId: user.id, institutionId: bank.id, name: "Main" } });
      const contract = { product: "CDB", issuer: "Original", indexer: "PRE", rate: "10", basis: "BUSINESS_252", purchaseQuantity: "3" } as const;
      await addPosition({ monthId: month.id, addition: { accountId: account.id, value: "3000", strategy: null, allocations: [], newAsset: {
        name: "Original", kind: "fixed-income", ticker: null, manualPriceBrl: null, quoteCheckToken: null, maturityDate, appliedOn: sourceDay, fixedIncomeContract: { ...contract },
      } } });
      const purchase = await db.positionTransaction.findFirstOrThrow({ where: { userId: user.id }, include: { position: true } });
      const holdings = () => db.position.findMany({ where: { assetId: purchase.position.assetId }, orderBy: { portfolioMonth: { referenceDate: "asc" } }, select: { id: true, totalBrl: true } });
      const before = await holdings();
      const correctedMaturity = toDateKey(addMonths(currentDate, 10));
      const change = await updateTransaction({
        monthId: purchase.position.portfolioMonthId, transactionId: purchase.id,
        transaction: { positionId: purchase.positionId, kind: "CONTRIBUTION", occurredOn: earlierDay, amountBrl: "4000", quantity: null, unitPriceBrl: null },
        fixedIncome: { maturityDate: correctedMaturity, contract: { ...contract, product: "LCI", issuer: "Corrected", rate: "12", purchaseQuantity: "4" } },
      });
      const updated = await db.positionTransaction.findUniqueOrThrow({ where: { id: purchase.id }, include: { position: { include: { asset: true, portfolioMonth: true, allocations: true } } } });
      assert.equal(toDateKey(updated.occurredOn), earlierDay);
      assert.equal(toDateKey(updated.position.portfolioMonth.referenceDate), earlierDay);
      assert.equal(updated.amountBrl.toString(), "4000");
      assert.match(updated.position.asset.name, /^LCI Corrected 12%/);
      assert.equal(toDateKey(updated.position.asset.maturityDate!), correctedMaturity);
      assert.equal(updated.position.allocations[0].weight.toString(), "1");
      assert.ok((await holdings()).at(-1)!.totalBrl.gt(before.at(-1)!.totalBrl));
      await undoChange(change.undoToken);
      assert.deepEqual((await holdings()).map(row => [row.id, row.totalBrl.toString()]), before.map(row => [row.id, row.totalBrl.toString()]));
      assert.equal(toDateKey((await db.positionTransaction.findUniqueOrThrow({ where: { id: purchase.id } })).occurredOn), sourceDay);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await db.position.deleteMany({ where: { userId: user.id } });
    await db.account.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
