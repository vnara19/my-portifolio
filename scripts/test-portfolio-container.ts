/** Manual integration check. Run only against a disposable isolated schema. */
import assert from "node:assert/strict";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { addPosition, undoChange } from "@/modules/portfolio/application/month-editing";
import { getEditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import { getMonthPositions } from "@/modules/portfolio/application/get-month-positions";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "", /^english099_[a-f0-9]+$/);
  const db = getPrismaClient()!;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: "cash-test@portfolio.invalid" } });
    await runAsUser(user.id, async () => {
      const month = await db.portfolioMonth.findFirstOrThrow({ where: { userId: user.id }, orderBy: { referenceDate: "desc" } });
      const before = await db.account.count({ where: { userId: user.id } });
      const add = (name: string, value: string) => addPosition({ monthId: month.id, addition: {
        // No account or institution is supplied by the form.
        newAsset: { name, kind: "brl-cash", ticker: null, maturityDate: null, quoteCheckToken: null, manualPriceBrl: null, cashAccount: true },
        value, strategy: null, allocations: [],
      } });
      const first = await add("Alpha reserve", "3000");
      const catalog = await getEditingCatalog(); assert.ok(catalog.portfolioAccountId);
      assert.equal("institutions" in catalog, false); assert.equal("accounts" in catalog, false);
      assert.equal(await db.account.count({ where: { userId: user.id } }), before + 1);
      const second = await add("Zulu reserve", "1500");
      assert.equal(await db.account.count({ where: { userId: user.id } }), before + 1);
      const rows = (await getMonthPositions(month.referenceDate))!.positions;
      assert.equal(rows.find((p) => p.assetName === "Alpha reserve")?.accountId, catalog.portfolioAccountId);
      assert.equal(rows.find((p) => p.assetName === "Zulu reserve")?.accountId, catalog.portfolioAccountId);
      assert.ok(rows.every((p) => !("institutionName" in p)));
      await undoChange(second.undoToken); await undoChange(first.undoToken);
      assert.equal(await db.account.count({ where: { userId: user.id } }), before);
      // Leave disposable examples for the manual browser check after verifying Undo.
      await add("Alpha reserve", "3000"); await add("Zulu reserve", "1500");
      console.log("Institution-free add, shared container reuse, legacy account preservation, read models and Undo passed.");
    });
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
