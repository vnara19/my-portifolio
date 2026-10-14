import assert from "node:assert/strict";

import { calculateCdiMonth, projectCdiBalance, type CdiMovement } from "../src/modules/portfolio/domain/cdi-valuation";

const rates = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"].map((date) => ({ date, dailyPercent: "1" }));
const coverage = [{ from: "2026-10-01", through: "2026-10-06" }];
function value(asOf: string, movements: CdiMovement[] = [], options: { opening?: string; maturity?: string; percentage?: string } = {}) {
  const result = calculateCdiMonth({
    openingBalance: options.opening ?? "1000",
    startDate: "2026-10-01",
    asOf,
    maturityDate: options.maturity,
    cdiPercent: options.percentage ?? "100",
    movements,
    rates,
    verifiedCoverage: coverage,
  });
  if (result.state !== "calculated") {
    throw new Error(result.message);
  }
  return result;
}


assert.equal(value("2026-10-01").balance, "1000.00");
assert.equal(value("2026-10-02").balance, "1010.00");
assert.equal(value("2026-10-06").balance, "1030.30");
assert.equal(value("2026-10-06").rateDays, 3);


const deposits = value("2026-10-06", [
  { date: "2026-10-01", kind: "CONTRIBUTION", amount: "1000" },
  { date: "2026-10-05", kind: "CONTRIBUTION", amount: "1000" },
], { opening: "0" });
assert.equal(deposits.balance, "2040.30");
assert.equal(deposits.income, "40.30100000");


const withdrawal = value("2026-10-06", [{ date: "2026-10-05", kind: "WITHDRAWAL", amount: "500" }]);
assert.equal(withdrawal.balance, "525.30");
assert.equal(withdrawal.income, "25.30100000");


assert.equal(value("2026-10-06", [], { maturity: "2026-10-02" }).balance, "1010.00");
assert.equal(value("2026-10-02", [], { percentage: "105" }).balance, "1010.50");


const missing = calculateCdiMonth({ openingBalance: "1000", startDate: "2026-10-01", asOf: "2026-10-06", cdiPercent: "100", movements: [], rates, verifiedCoverage: [] });
assert.equal(missing.state, "unavailable");
const holiday = calculateCdiMonth({ openingBalance: "1000", startDate: "2026-10-01", asOf: "2026-10-06", cdiPercent: "100", movements: [], rates: rates.filter((entry) => entry.date !== "2026-10-02"), verifiedCoverage: coverage });
assert.equal(holiday.state === "calculated" && holiday.balance, "1020.10");


const invalidWithdrawal = calculateCdiMonth({ openingBalance: "0", startDate: "2026-10-01", asOf: "2026-10-06", cdiPercent: "100", movements: [{ date: "2026-10-02", kind: "WITHDRAWAL", amount: "500" }, { date: "2026-10-05", kind: "CONTRIBUTION", amount: "1000" }], rates, verifiedCoverage: coverage });
assert.equal(invalidWithdrawal.state, "unavailable");

assert.equal(projectCdiBalance({ balance: "1000", dailyPercent: "1", cdiPercent: "100", businessDays: 3 }), "1030.30");
console.log("CDI: contribution/withdrawal dates, maturity, coverage and projection passed without a database.");
