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
  assert.equal(valuation.quote!.date, "2026-10-01");
  const euro = bondValue({ ...bond, currency: "EUR", issuerCountry: "United States" }, "2026-10-22", "6");
  assert.equal(euro.totalBrl.toFixed(2), "63000.00");
});
test("bond valuation selects dated history, preserves zero values and handles principal repayments", () => {
  const later = { ...bond, quotes: [...bond.quotes, { date: "2026-11-01", marketValue: "10600", source: "Broker" }] };
  assert.equal(bondValue(later, "2026-10-31", 5).quote!.marketValue, "10500");
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

test("verified Citigroup terms produce fractional gross coupons and contractual 30/360 accrual", async () => {
  const { bondReference } = await import("@/modules/portfolio/domain/bond-reference");
  const { scheduledBondCoupons, fixedBondAccrued } = await import("@/modules/portfolio/domain/international-bond");
  const citi = bondReference("US172967KU42")!;
  assert.equal(bondReference("172967KU4")?.issuer, "Citigroup Inc.");
  assert.equal(bondReference("US61690D6W39"), null);
  const terms = citi.fixedCoupon!;
  const schedule = scheduledBondCoupons(terms, "2026-10-23", citi.maturityDate, "1500");
  assert.deepEqual(schedule, [
    { date: "2027-01-25", amount: "30.9375" }, { date: "2027-07-25", amount: "30.9375" },
    { date: "2028-01-25", amount: "30.9375" }, { date: "2028-07-25", amount: "30.9375" },
  ]);
  assert.equal(fixedBondAccrued(terms, "2026-10-23", "1000", citi.maturityDate).toFixed(8), "10.08333333");
  assert.equal(fixedBondAccrued(terms, "2027-01-25", "1000", citi.maturityDate).toString(), "0");
  assert.equal(fixedBondAccrued(terms, "2028-07-25", "1000", citi.maturityDate).toString(), "0");
  assert.equal(scheduledBondCoupons(terms, "2028-07-25", citi.maturityDate, "1000").length, 0);
  assert.throws(() => fixedBondAccrued({ ...terms, dayCount: "Manual" }, "2026-10-23", "1000", citi.maturityDate));
});

test("bond price formats convert fractional units once, adding interest only to clean prices", async () => {
  const { bondPriceToHoldingValue } = await import("@/modules/portfolio/domain/international-bond");
  const input = { price: "992.31", quantity: "1.5", faceValuePerBond: "1000", priceBasis: "PerBond" as const, priceType: "Dirty" as const, accruedInterest: "15.645" };
  assert.equal(bondPriceToHoldingValue(input), "1488.465");
  assert.equal(bondPriceToHoldingValue({ ...input, price: "99.231", priceBasis: "Percent" }), "1488.465");
  assert.equal(bondPriceToHoldingValue({ ...input, price: "981.89", priceType: "Clean" }), "1488.48");
  assert.throws(() => bondPriceToHoldingValue({ ...input, quantity: "0" }));
  assert.throws(() => bondPriceToHoldingValue({ ...input, accruedInterest: "-10" }));
});

test("regular coupon metadata survives JSON restoration and rejects unsupported schedules", async () => {
  const { bondReference } = await import("@/modules/portfolio/domain/bond-reference");
  const citi = bondReference("US172967KU42")!;
  const fixed = { ...bond, identifier: "US172967KU42", issuer: citi.issuer, maturityDate: citi.maturityDate, fixedCoupon: citi.fixedCoupon, faceValuePerBond: "1000" };
  assert.deepEqual(readInternationalBond(JSON.parse(JSON.stringify(fixed))), fixed);
  assert.equal(readInternationalBond({ ...fixed, maturityDate: "2028-08-10" }), null);
  assert.equal(readInternationalBond({ ...fixed, structure: "Floating" }), null);
  assert.equal(readInternationalBond({ ...fixed, fixedCoupon: { ...fixed.fixedCoupon, annualRate: "NaN" } }), null);
  assert.equal(readInternationalBond({ ...fixed, fixedCoupon: { ...fixed.fixedCoupon, frequency: 3 } }), null);
  assert.equal(readInternationalBond({ ...fixed, maturityDate: null }), null);
  assert.notEqual(readInternationalBond(bond), null);
});

test("purchase accrued interest is entered per bond and stored for the fractional holding", async () => {
  const { purchaseBondInterest } = await import("@/modules/portfolio/domain/international-bond");
  assert.equal(purchaseBondInterest("10.43", "1.5"), "15.645");
  assert.equal(purchaseBondInterest("10.43", "1"), "10.43");
  assert.equal(purchaseBondInterest("0", "1.5"), "0");
  assert.throws(() => purchaseBondInterest("", "1.5"));
  assert.throws(() => purchaseBondInterest("-1", "1.5"));
  assert.throws(() => purchaseBondInterest("10.43", "0"));
});

test("hold-to-maturity entries need no quotation and carry actual cost without forecast income", async () => {
  const { bondCostState } = await import("@/modules/portfolio/domain/international-bond");
  const cost = internationalBondSchema.parse({ ...bond, valuationMode: "Cost", quotes: [], totalPaid: "9800", accruedInterestPaid: "50" });
  const value = bondValue(cost, "2026-10-23", 5);
  assert.equal(value.quote, null);
  assert.equal(value.totalBrl.toString(), "49000");
  assert.equal(bondValue(cost, "2026-12-31", 5).totalBrl.toString(), "49000");
  assert.equal(bondCostState(cost, "2026-10-23").interest.toString(), "50");
  assert.equal(readInternationalBond({ ...cost, quotes: bond.quotes }), null);
  assert.equal(readInternationalBond({ ...bond, quotes: [] }), null);
  assert.throws(() => bondValue(cost, "2025-01-01", 5));
});

test("cost receipts recover prepaid interest without creating unrealized gains and preserve historical values", async () => {
  const cost = internationalBondSchema.parse({ ...bond, valuationMode: "Cost", quotes: [], totalPaid: "9800", accruedInterestPaid: "50", costEvents: [{ date: "2026-10-23", coupon: "100", redeemedFace: "0" }, { date: "2026-11-23", coupon: "0", redeemedFace: "5000" }] });
  assert.equal(bondValue(cost, "2026-10-22", 1).totalBrl.toString(), "9800");
  assert.equal(bondValue(cost, "2026-10-23", 1).totalBrl.toString(), "9750");
  assert.equal(bondValue(cost, "2026-11-23", 1, "5000").totalBrl.toString(), "4875");
  assert.throws(() => bondValue(cost, "2026-11-23", 1, "10000"));
  const { portfolioGains } = await import("@/modules/portfolio/domain/portfolio-gains");
  const gains = portfolioGains([
    { holding: "bond", kind: "CONTRIBUTION", quantity: 10000, amountBrl: 9800, usdRate: 1, transferId: null },
    { holding: "bond", kind: "INCOME", quantity: 0, amountBrl: 100, costRecoveryUsd: 50, usdRate: 1, transferId: null },
  ], [{ holding: "bond", quantity: 10000, valueUsd: bondValue(cost, "2026-10-23", 1).totalBrl.toNumber() }]);
  assert.equal(gains.unrealizedUsd, 0); assert.equal(gains.realizedUsd, 50);
  assert.deepEqual(readInternationalBond(JSON.parse(JSON.stringify(cost))), cost);
});

test("cost cash history rejects invalid repayments and never changes legacy market tracking", () => {
  const cost = { ...bond, valuationMode: "Cost", quotes: [], costEvents: [{ date: "2026-10-23", coupon: "0", redeemedFace: "10000" }] };
  assert.equal(bondValue(internationalBondSchema.parse(cost), "2026-10-23", 5, "0").totalBrl.toString(), "0");
  assert.equal(readInternationalBond({ ...cost, costEvents: [{ date: "2026-10-23", coupon: "0", redeemedFace: "10001" }] }), null);
  assert.equal(readInternationalBond({ ...cost, costEvents: [{ date: "2025-01-01", coupon: "0", redeemedFace: "0" }] }), null);
  assert.equal(bondValue(bond, "2026-10-23", 5).quote?.marketValue, "10500");
});

test("cost-tracked detail return includes received coupons and principal without a price gain", async () => {
  const { bondCostReturn } = await import("@/modules/portfolio/domain/international-bond");
  assert.deepEqual(bondCostReturn(9750, [{ kind: "CONTRIBUTION", amountBrl: 9800 }, { kind: "INCOME", amountBrl: 100 }]), { gainBrl: 50, contributionsBrl: 9800 });
  assert.equal(bondCostReturn(4875, [{ kind: "CONTRIBUTION", amountBrl: 9800 }, { kind: "INCOME", amountBrl: 100 }, { kind: "WITHDRAWAL", amountBrl: 5000 }]).gainBrl, 175);
});
