/** Atomic database counters survive concurrency and multiple server instances. */
import { createHash, randomUUID } from "node:crypto";
import { getPrismaClient } from "./prisma";

export async function consumeRateLimit(userId: string, bucket: string, max = 120, windowSeconds = 60) {
  const db = getPrismaClient();
  if (!db) throw new Error("Rate limit storage unavailable");
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const subject = createHash("sha256").update(userId).digest("hex");
  const key = `app:${bucket}:${subject}:${Math.floor(now / windowMs)}`;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limits" ("id", "key", "count", "last_request")
    VALUES (${randomUUID()}::uuid, ${key}, 1, ${BigInt(now)})
    ON CONFLICT ("key") DO UPDATE
      SET "count" = LEAST("rate_limits"."count" + 1, ${max + 1})
    RETURNING "count"
  `;
  // Bound retained application counters without touching Better Auth's own keys.
  if (Math.random() < 0.01) {
    await db.rateLimit.deleteMany({ where: { key: { startsWith: "app:" }, lastRequest: { lt: BigInt(now - 86_400_000) } } });
  }
  return { allowed: rows[0].count <= max, retryAfter: Math.ceil((windowMs - now % windowMs) / 1000) };
}
