/** Registration and ownership checks only run against a disposable test schema. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getAuth } from "../src/modules/auth/auth";
import { databaseSchema, getPrismaClient } from "../src/lib/prisma";
import { getUserDb, runAsUser } from "../src/lib/user-db";
import { ensureMonthsUpToDate } from "../src/modules/portfolio/application/month-rollover";

async function main() {
  assert.match(databaseSchema(process.env.DATABASE_URL ?? "") ?? "", /^english099_[a-f0-9]+$/);
  const db = getPrismaClient()!;
  const auth = getAuth();
  const origin = "http://localhost:3210";
  const request = (path: string, body: unknown, cookie = "", source = origin) => auth.handler(
    new Request(origin + "/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: { origin: source, "content-type": "application/json", cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  const email = `public-${randomUUID()}@portfolio.invalid`;
  const password = `Test!9${randomUUID()}`;
  try {
    const weak = await request("/sign-up/email", { email, password: "weak", name: "Test" });
    assert.notEqual(weak.status, 200);
    assert.notEqual((await request("/sign-up/email", { email: "invalid-email", password, name: "Test" })).status, 200);
    assert.notEqual((await request("/sign-up/email", { email, password: password.repeat(5), name: "Test" })).status, 200);
    const foreign = await request("/sign-up/email", { email, password, name: "Test" }, "", "https://untrusted.invalid");
    assert.notEqual(foreign.status, 200);
    const registered = await request("/sign-up/email", { email, password, name: "Test" });
    assert.equal(registered.status, 200);
    const body = await registered.json();
    assert.equal(body.token, null);
    const id = body.user.id;
    assert.equal(await db.session.count({ where: { userId: id } }), 0);
    const credential = await db.authAccount.findFirstOrThrow({ where: { userId: id, providerId: "credential" } });
    assert.ok(credential.password && credential.password !== password);
    const duplicate = await request("/sign-up/email", { email, password, name: "Duplicate" });
    assert.equal(duplicate.status, 422);
    assert.equal((await duplicate.json()).code, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    assert.equal((await request("/sign-up/email", { email: ` ${email.toUpperCase()} `, password, name: "Duplicate" })).status, 422);
    assert.equal(await db.user.count({ where: { email } }), 1);
    assert.notEqual((await request("/sign-in/email", { email, password: "Wrong!9passwordlong" })).status, 200);
    const concurrentEmail = `concurrent-${randomUUID()}@portfolio.invalid`;
    const attempts = await Promise.all([
      request("/sign-up/email", { email: concurrentEmail, password, name: "Concurrent" }),
      request("/sign-up/email", { email: concurrentEmail.toUpperCase(), password, name: "Concurrent" }),
    ]);
    assert.equal(attempts.filter(response => response.status === 200).length, 1);
    assert.equal(attempts.filter(response => response.status === 422).length, 1);
    assert.equal(await db.user.count({ where: { email: concurrentEmail } }), 1);
    const login = await request("/sign-in/email", { email: ` ${email.toUpperCase()} `, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const session = await request("/get-session", null, cookie);
    assert.equal((await session.json()).user.id, id);
    await runAsUser(id, async () => {
      await ensureMonthsUpToDate();
      const scoped = (await getUserDb())!;
      assert.equal(await scoped.position.count(), 0);
      assert.equal(await scoped.positionTransaction.count(), 0);
      assert.equal(await scoped.asset.count(), 0);
      assert.equal(await scoped.portfolioMonth.count(), 1);
      const foreignAsset = await db.asset.findFirst({ where: { userId: { not: id } } });
      if (foreignAsset) assert.equal(await scoped.asset.findUnique({ where: { id: foreignAsset.id } }), null);
    });
    console.log("Public registration passed: password policy, origin protection, password hashing, duplicate rejection, no automatic session, explicit sign-in and empty isolated portfolio.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Registration check failed");
  process.exitCode = 1;
});
