import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { tradeReportingFx, usdReferenceNote } from "@/modules/portfolio/domain/trade-reporting-fx";

const point = (day: string, rate: number, provider = "frankfurter-ecb") =>
  ({ day, rate: new Prisma.Decimal(rate), provider, fetchedAt: new Date(day) });

test("EUR trades use comparable historical reference legs and never use a future fixing", () => {
  const result = tradeReportingFx("2026-11-06", "FX 6.1355 BRL/EUR.", "USD", {
    EUR: [point("2026-11-05", 6.1355), point("2026-11-06", 6.1449), point("2026-11-09", 6.1748)],
    USD: [point("2026-11-05", 5.4664), point("2026-11-06", 5.5037, "other"), point("2026-11-09", 5.5167)],
  });
  assert.equal(result?.reference?.day, "2026-11-05");
  assert.equal(result?.nativeRate?.toFixed(8), new Prisma.Decimal(6.1355).div(5.4664).toFixed(8));
  assert.equal(result?.divisor.toFixed(8), "5.46640000");
});

test("new trades keep the captured historical reference even after the price feed changes", () => {
  const note = "FX 6.1355 BRL/EUR." + usdReferenceNote({
    tradeDay: "2026-11-06", day: "2026-11-05", currency: "EUR",
    usdPerUnit: "1.1224", fetchedAt: "2026-11-06T11:00:00.000Z",
  });
  const series = { EUR: [], USD: [] };
  assert.equal(tradeReportingFx("2026-11-06", note, "USD", series)?.nativeRate?.toFixed(), "1.1224");
  assert.equal(tradeReportingFx("2026-11-07", note, "USD", series), null);
  assert.equal(tradeReportingFx("2026-11-06", "FX 5.5 BRL/USD.", "USD", series)?.nativeRate?.toFixed(), "1");
});

test("a later broker amendment takes precedence without discarding the original reference", async () => {
  const { executionFxNote } = await import("@/modules/portfolio/domain/trade-reporting-fx");
  const time = new Date("2026-11-10T12:00:00Z");
  const note = "FX 6.1355 BRL/EUR." + usdReferenceNote({
    tradeDay: "2026-11-06", day: "2026-11-05", currency: "EUR",
    usdPerUnit: "1.1224", fetchedAt: time.toISOString(),
  }) + executionFxNote("EUR", "1.11", "2026-11-06", time)
     + executionFxNote("EUR", "1.12", "2026-11-06", time);
  const fx = tradeReportingFx("2026-11-06", note, "USD", { EUR: [], USD: [] });
  assert.equal(fx?.nativeRate?.toFixed(), "1.12");
  assert.equal(fx?.reference, null);
});
