import assert from "node:assert/strict";
import test from "node:test";
import { fixedIncomeBalanceHistory } from "../../src/modules/portfolio/domain/fixed-income-balance-history";

test("daily accrual values include the purchase and stop at the last recorded fixing", () => {
  const history = fixedIncomeBalanceHistory({
    openingBalance: "0", startDate: "2026-11-12", asOf: "2026-11-17",
    parts: [{ indexer: "CDI", weight: "1", ratePercent: "100" }],
    rates: [{ date: "2026-11-12", dailyPercent: "0.1" }],
    verifiedCoverage: [{ from: "2026-11-12", through: "2026-11-12" }],
    movements: [
      { date: "2026-11-12", kind: "CONTRIBUTION", amount: "1000" },
      { date: "2026-11-16", kind: "CONTRIBUTION", amount: "50" },
    ],
  }, "2026-11-12");
  assert.deepEqual([...history!], [
    ["2026-11-12", 1001], ["2026-11-13", 1001], ["2026-11-14", 1001],
    ["2026-11-15", 1001], ["2026-11-16", 1051],
  ]);
});

test("new investments have a purchase-day value before their first accrual", () => {
  const history = fixedIncomeBalanceHistory({
    openingBalance: "0", startDate: "2026-11-16", asOf: "2026-11-17",
    parts: [{ indexer: "CDI", weight: "1", ratePercent: "100" }],
    rates: [], verifiedCoverage: [],
    movements: [{ date: "2026-11-16", kind: "CONTRIBUTION", amount: "1000" }],
  }, "2026-11-15");
  assert.deepEqual([...history!], [["2026-11-16", 1000]]);
});
