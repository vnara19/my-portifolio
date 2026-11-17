import test from "node:test";
import assert from "node:assert/strict";
import { fixedIncomeDailyGain } from "../../src/modules/portfolio/domain/fixed-income-daily-gain";

const input = {
  startDate: "2026-11-13",
  parts: [{ indexer: "CDI" as const, weight: "100", ratePercent: "110" }],
  rates: [{ date: "2026-11-13", dailyPercent: "0.05" }],
  verifiedCoverage: [{ from: "2026-11-13", through: "2026-11-13" }],
  movements: [{ date: "2026-11-13", kind: "CONTRIBUTION" as const, amount: "10000" }],
};

test("daily gain uses the last recorded CDI accrual and excludes later contributions", () => {
  const movements = [...input.movements, { date: "2026-11-16", kind: "CONTRIBUTION" as const, amount: "1000" }];
  assert.deepEqual(fixedIncomeDailyGain({ ...input, movements }, "2026-11-13", "2026-11-16", 11005.50),
    { amount: 5.5, percent: 0.055 });
});

test("daily gain stays unavailable if the rate or reconciliation is missing", () => {
  const unavailable = { amount: null, percent: null };
  assert.deepEqual(fixedIncomeDailyGain(input, "2026-11-13", "2026-11-16", 10000), unavailable);
  assert.deepEqual(fixedIncomeDailyGain({ ...input, rates: [] }, "2026-11-13", "2026-11-16", 10005.5), unavailable);
});

test("fixed-rate daily accrual uses the contracted day-count basis", () => {
  const exactGain = 10_000 * (1.13 ** (1 / 365) - 1);
  const actual = fixedIncomeDailyGain({
    ...input, annualBasis: "CALENDAR_365", parts: [{ indexer: "PRE", weight: "100", ratePercent: "13" }],
  }, "2026-11-13", "2026-11-14", Number((10_000 + exactGain).toFixed(2)));
  assert.ok(actual.amount !== null && Math.abs(actual.amount - exactGain) < 1e-8);
});
