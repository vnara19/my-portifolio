import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateIncomeMonth } from "@/modules/portfolio/domain/cdi-valuation";
import { brazilianFixedIncomeSchema, fixedIncomeAllocation } from "@/modules/portfolio/domain/brazilian-fixed-income";
const base = { openingBalance: "10000", startDate: "2025-01-01", asOf: "2026-01-01", movements: [], rates: [], verifiedCoverage: [] };

test("calendar fixed yield compounds to the contracted full-year return and stops at maturity", () => {
  const fixed = { ...base, annualBasis: "CALENDAR_365" as const, parts: [{ indexer: "PRE" as const, weight: "1", ratePercent: "12" }] };
  const result = calculateIncomeMonth(fixed);
  assert.equal(result.state, "calculated");
  if (result.state === "calculated") assert.equal(result.balance, "11200.00");
  assert.deepEqual(calculateIncomeMonth({ ...fixed, maturityDate: "2025-07-01" }), calculateIncomeMonth({ ...fixed, asOf: "2025-07-01" }));
});

test("IPCA estimate compounds monthly inflation and real yield, without projecting unpublished inflation", () => {
  const result = calculateIncomeMonth({ ...base, startDate: "2025-01-01", asOf: "2025-02-01", annualBasis: "CALENDAR_365", parts: [{ indexer: "IPCA", weight: "1", ratePercent: "10" }], ipcaRates: [{ date: "2025-01-01", dailyPercent: "1" }] });
  assert.equal(result.state, "calculated");
  if (result.state === "calculated") assert.ok(Math.abs(Number(result.balance) - 10000 * 1.01 * Math.pow(1.1, 31 / 365)) <= 0.01);
  const missing = calculateIncomeMonth({ ...base, parts: [{ indexer: "IPCA", weight: "1", ratePercent: "6" }], ipcaRates: [{ date: "2025-01-01", dailyPercent: "1" }, { date: "2025-03-01", dailyPercent: "1" }] });
  assert.equal(missing.state, "unavailable");
});

test("bank-product classification and contract validation reject unknown products", () => {
  const contract = brazilianFixedIncomeSchema.parse({ product: "LCI", issuer: "Issuer", indexer: "IPCA", rate: "6.5", basis: "BUSINESS_252" });
  assert.deepEqual(fixedIncomeAllocation(contract, "2026-01-01", "2029-01-01"), { assetClass: "Renda Fixa", subclass: "IPCA", duration: "Médio" });
  assert.equal(brazilianFixedIncomeSchema.safeParse({ ...contract, product: "CRI" }).success, false);
});

test("IPCA deflation is retained and absent future months do not invent positive inflation", () => {
  const result = calculateIncomeMonth({ ...base, startDate: "2025-01-01", asOf: "2025-03-01", annualBasis: "CALENDAR_365", parts: [{ indexer: "IPCA", weight: "1", ratePercent: "1" }], ipcaRates: [{ date: "2025-01-01", dailyPercent: "-1" }] });
  assert.equal(result.state, "calculated");
  if (result.state === "calculated") assert.ok(Math.abs(Number(result.balance) - 10000 * 0.99 * Math.pow(1.01, 59 / 365)) <= 0.01);
});
