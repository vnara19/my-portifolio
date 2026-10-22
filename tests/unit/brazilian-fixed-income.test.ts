import assert from "node:assert/strict";
import { test } from "node:test";
import { businessDaysBetween } from "@/modules/portfolio/domain/business-days";
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

test("IPCA reference compounds published months and real yield", () => {
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
  if (result.state === "calculated") assert.ok(Math.abs(Number(result.balance) - 10000 * 0.99 * Math.pow(1.01, 31 / 365)) <= 0.01);
});


test("business-day IPCA stops at published reference and never accrues on weekends", () => {
  const input = { ...base, startDate: "2025-01-01", annualBasis: "BUSINESS_252" as const, parts: [{ indexer: "IPCA" as const, weight: "1", ratePercent: "6" }], ipcaRates: [{ date: "2025-01-01", dailyPercent: "1" }] };
  const january = calculateIncomeMonth({ ...input, asOf: "2025-02-01" });
  if (january.state === "calculated") assert.ok(Math.abs(Number(january.balance) - 10000 * 1.01 * Math.pow(1.06, businessDaysBetween("2025-01-01", "2025-02-01") / 252)) <= 0.01);
  assert.deepEqual(calculateIncomeMonth({ ...input, asOf: "2025-01-01" }), calculateIncomeMonth({ ...input, asOf: "2025-01-02" }));
  assert.deepEqual(calculateIncomeMonth({ ...input, asOf: "2025-02-01" }), calculateIncomeMonth({ ...input, asOf: "2025-03-01" }));
  assert.deepEqual(calculateIncomeMonth({ ...input, asOf: "2025-01-11" }), calculateIncomeMonth({ ...input, asOf: "2025-01-13" }));
  const updated = calculateIncomeMonth({ ...input, asOf: "2025-03-01", ipcaRates: [...input.ipcaRates, { date: "2025-02-01", dailyPercent: "0.5" }] });
  const old = calculateIncomeMonth({ ...input, asOf: "2025-03-01" });
  assert.equal(updated.state, "calculated");
  if (updated.state === "calculated" && old.state === "calculated") assert.ok(Number(updated.balance) > Number(old.balance));
});
