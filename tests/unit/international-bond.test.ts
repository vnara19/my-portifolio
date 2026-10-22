import { test } from "node:test";
import assert from "node:assert/strict";
import { internationalBondSchema, bondValue, validBondIdentifier, bondAllocation, readInternationalBond } from "@/modules/portfolio/domain/international-bond";
import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
const bond = internationalBondSchema.parse({ type: "international-bond", identifier: "US105756BK57", issuer: "Federative Republic of Brazil", issuerCountry: "Brazil", currency: "USD", family: "Sovereign", structure: "Fixed", faceAmount: "10000", totalPaid: "9803", settlementDate: "2026-01-15", maturityDate: "2037-01-20", quotes: [{ date: "2026-10-01", marketValue: "10500", source: "IBKR" }] });
test("bond identifiers validate ISIN/CUSIP checksums without inferring issuer nationality", () => {
  for (const id of ["US61690D6W39", "US61768UU475", "US105756BK57", "IE00BV8C9B83", "105756BK5"]) assert.equal(validBondIdentifier(id), true);
  for (const id of ["US105756BK58", "IE00BV8C9B84", "105756BK6", "VOO", "EUR"]) assert.equal(validBondIdentifier(id), false);
  assert.equal(bond.issuerCountry, "Brazil");
  assert.equal(readFixedIncomeContract(bond), null);
  assert.deepEqual(bondAllocation(bond), { assetClass: "Renda Fixa", subclass: "Prefixado", duration: "Longo" });
});
test("full broker value is converted once and does not add coupon accrual again", () => {
  const valuation = bondValue(bond, "2026-10-22", "5");
  assert.equal(valuation.totalBrl.toFixed(2), "52500.00");
  assert.equal(valuation.unitPriceBrl.toFixed(8), "5.25000000");
  assert.equal(valuation.quote.date, "2026-10-01");
  const euro = bondValue({ ...bond, currency: "EUR", issuerCountry: "United States" }, "2026-10-22", "6");
  assert.equal(euro.totalBrl.toFixed(2), "63000.00");
});
test("bond valuation selects dated history, preserves zero values and handles principal repayments", () => {
  const later = { ...bond, quotes: [...bond.quotes, { date: "2026-11-01", marketValue: "10600", source: "Broker" }] };
  assert.equal(bondValue(later, "2026-10-31", 5).quote.marketValue, "10500");
  assert.throws(() => bondValue(later, "2026-09-01", 5));
  assert.throws(() => bondValue(later, "2026-10-31", 0));
  assert.equal(bondValue({ ...bond, quotes: [{ date: "2026-10-22", marketValue: "5000", source: "Broker" }] }, "2026-10-22", 5, "5000").unitPriceBrl.toString(), "5");
  const closed = bondValue({ ...bond, quotes: [{ date: "2026-10-22", marketValue: "0", source: "Broker" }] }, "2026-10-22", 5, "0");
  assert.equal(closed.totalBrl.toString(), "0"); assert.equal(closed.unitPriceBrl.toString(), "0");
});
test("bond metadata rejects invalid dates, unsupported currencies, duplicate dates and pre-settlement prices", () => {
  assert.equal(readInternationalBond({ ...bond, currency: "GBP" }), null);
  assert.equal(readInternationalBond({ ...bond, maturityDate: "2026-02-30" }), null);
  assert.equal(readInternationalBond({ ...bond, quotes: [...bond.quotes, ...bond.quotes] }), null);
  assert.equal(readInternationalBond({ ...bond, quotes: [{ ...bond.quotes[0], date: "2025-01-01" }] }), null);
});


test("coupon reimbursement of interest paid at purchase reduces cost without becoming profit twice", async () => {
  const { portfolioGains } = await import("@/modules/portfolio/domain/portfolio-gains");
  const gains = portfolioGains([
    { holding: "bond", kind: "CONTRIBUTION", quantity: 10000, amountBrl: 9800, usdRate: 1, transferId: null },
    { holding: "bond", kind: "INCOME", quantity: 0, amountBrl: 100, costRecoveryUsd: 50, usdRate: 1, transferId: null },
  ], [{ holding: "bond", quantity: 10000, valueUsd: 10100 }]);
  assert.equal(gains.unrealizedUsd, 350); assert.equal(gains.realizedUsd, 50); assert.equal(gains.totalUsd, 400);
});
