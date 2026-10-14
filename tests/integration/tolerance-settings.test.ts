import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { saveTolerance } from "@/modules/portfolio/application/target-plan-editing";
const isolated = /^english099_[a-f0-9]+$/.test(databaseSchema(process.env.DATABASE_URL ?? "") ?? "");

test("tolerance saves independently of hidden targets and never changes another user's settings", { skip: !isolated }, async () => {
  const db = getPrismaClient()!;
  const users = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await db.user.createMany({ data: users.map((id) => ({ id, name: "Settings test", email: `${id}@portfolio.invalid` })) });
    const plans = [];
    for (const userId of users.slice(0, 2)) {
      plans.push(await db.targetPlan.create({ data: { userId, name: "Existing plan", tolerancePercent: "2", targets: { create: { key: "cash", scope: "ASSET_CLASS", primaryLabel: "Caixa", percentage: "0.23" } } } }));
    }
    const before = await db.allocationTarget.findMany({ where: { userId: users[0] } });
    await runAsUser(users[0], () => saveTolerance("3.25"));
    assert.equal((await db.targetPlan.findUniqueOrThrow({ where: { id: plans[0].id } })).tolerancePercent.toString(), "3.25");
    assert.equal((await db.targetPlan.findUniqueOrThrow({ where: { id: plans[1].id } })).tolerancePercent.toString(), "2");
    assert.deepEqual(await db.allocationTarget.findMany({ where: { userId: users[0] } }), before);
    for (const raw of ["-1", "101", "2.123", "", "no"]) await assert.rejects(runAsUser(users[0], () => saveTolerance(raw)));
    await runAsUser(users[2], () => saveTolerance("1,5"));
    const created = await db.targetPlan.findFirstOrThrow({ where: { userId: users[2] }, include: { targets: true } });
    assert.equal(created.tolerancePercent.toString(), "1.5");
    assert.equal(created.targets.length, 0);
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
