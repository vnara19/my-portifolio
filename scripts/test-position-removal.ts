/** Run only against the disposable local integration-test schema. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { removePosition, undoChange } from "@/modules/portfolio/application/month-editing";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "", /^english099_[a-f0-9]+$/);
  const db = getPrismaClient()!;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: "cash-test@portfolio.invalid" } });
    await runAsUser(user.id, async () => {
      const institution = await db.institution.create({ data: { userId: user.id, name: "Removal audit", normalizedName: "removal-audit" } });
      const account = await db.account.create({ data: { userId: user.id, institutionId: institution.id, name: "Audit" } });
      const asset = await db.asset.create({ data: { userId: user.id, name: "Audit balance", normalizedKey: "removal-audit", assetType: "brl-balance", baseCurrency: "BRL" } });
      const positions = [];
      for (const month of [6, 7, 8]) {
        const frame = await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: new Date(Date.UTC(2024, month, 1)), status: "REVIEWED" } });
        const position = await db.position.create({ data: { userId: user.id, portfolioMonthId: frame.id, accountId: account.id, assetId: asset.id, quantity: "1100", openingQuantity: "1000", unitPriceBrl: "1", totalBrl: "1100" } });
        await db.positionAllocation.create({ data: { userId: user.id, positionId: position.id, assetClass: "Caixa", subclass: "-", duration: "-", weight: "1" } });
        await db.positionTransaction.create({ data: { userId: user.id, positionId: position.id, kind: "CONTRIBUTION", occurredOn: frame.referenceDate, quantity: "100", unitPriceBrl: "1", amountBrl: "100" } });
        positions.push(position);
      }
      const [old, selected, later] = positions;
      await assert.rejects(removePosition({ monthId: old.portfolioMonthId, positionId: selected.id }), /does not belong/);
      const removed = await removePosition({ monthId: selected.portfolioMonthId, positionId: selected.id });
      assert.equal(await db.position.count({ where: { id: selected.id } }), 0);
      assert.equal(await db.positionTransaction.count({ where: { positionId: selected.id } }), 0);
      assert.equal(await db.positionAllocation.count({ where: { positionId: selected.id } }), 0);
      assert.equal(await db.position.count({ where: { id: { in: [old.id, later.id] } } }), 2);
      await undoChange(removed.undoToken);
      assert.equal((await db.position.findUniqueOrThrow({ where: { id: selected.id } })).totalBrl.toString(), "1100");
      assert.equal(await db.positionTransaction.count({ where: { positionId: selected.id } }), 1);
      assert.equal(await db.positionAllocation.count({ where: { positionId: selected.id } }), 1);
      await db.positionTransaction.updateMany({ where: { positionId: selected.id }, data: { transferId: randomUUID() } });
      await assert.rejects(removePosition({ monthId: selected.portfolioMonthId, positionId: selected.id }), /linked cash movements/);
      assert.equal(await db.position.count({ where: { id: selected.id } }), 1);
      assert.equal(await db.positionTransaction.count({ where: { positionId: selected.id } }), 1);
      console.log("Removal scope, cascading records, historical preservation, Undo and linked-cash protection passed.");
    });
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
