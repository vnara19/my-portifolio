import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBondLookup, mergeBondSources } from "@/modules/portfolio/domain/bond-lookup";
import { lookupBond } from "@/modules/portfolio/application/lookup-bond";
import { emptyBondFields, validateBondEntry } from "@/modules/portfolio/domain/bond-entry";
import { openFigiBond, treasuryBond, treasuryCusip } from "@/modules/quotes/infrastructure/bond-reference";

test("lookup merges complementary confirmed fields and leaves disagreements manual", () => {
  const result = mergeBondSources("US172967KU42", [
    { name: "A", url: "https://a.example", fields: { currency: "USD", annualRate: "4.1250", maturityDate: "2028-07-25" } },
    { name: "B", url: "https://b.example", fields: { currency: "EUR", annualRate: "4.125", issuer: "Citigroup Inc." } },
  ]);
  assert.equal(result.fields.currency, undefined); assert.deepEqual(result.conflicts, ["currency"]);
  assert.equal(result.fields.issuer, "Citigroup Inc."); assert.equal(result.fields.annualRate, "4.1250");
});
test("lookup never overwrites manual edits, deliberate clears, purchase values or a different identifier", () => {
  const fields = { ...emptyBondFields(), identifier: "US172967KU42", issuer: "My issuer", totalPaid: "1500" };
  const result = mergeBondSources(fields.identifier, [{ name: "A", url: "https://a.example", fields: { issuer: "Other issuer", currency: "USD", maturityDate: "2028-07-25" } }]);
  const filled = applyBondLookup(fields, result, new Set(["currency"]));
  assert.equal(filled.issuer, "My issuer"); assert.equal(filled.currency, ""); assert.equal(filled.maturityDate, "2028-07-25"); assert.equal(filled.totalPaid, "1500");
  assert.deepEqual(applyBondLookup({ ...fields, identifier: "US105756BK57" }, result, new Set()), { ...fields, identifier: "US105756BK57" });
});
test("lookup preserves verified issuer terms when live sources fail and rejects invalid identifiers", async () => {
  const failed = async () => { throw new Error("timeout"); };
  const result = await lookupBond("US172967KU42", [failed, failed]);
  assert.equal(result.fields.annualRate, "4.125"); assert.equal(result.fields.frequency, "2"); assert.equal(result.fields.issuerCountry, "United States");
  assert.equal(result.unavailable.length, 2);
  await assert.rejects(lookupBond("US172967KU43", [failed]));
  const unknown = await lookupBond("US61690D6W39", [failed]); assert.deepEqual(unknown.fields, {});
});
test("Treasury adapter maps confirmed terms without copying auction prices or minimum denomination", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input)); assert.equal(url.hostname, "api.fiscaldata.treasury.gov");
      assert.equal(url.searchParams.get("filter"), "cusip:eq:91282CJE2");
      assert.ok(url.searchParams.get("fields")?.split(",").includes("auction_date"), "The API requires the sort field in the selected fields");
      return Response.json({ data: [{ cusip: "91282CJE2", security_type: "Note", maturity_date: "2025-10-31", int_rate: "5.000000", int_payment_frequency: "Semi-Annual", first_int_payment_date: "2024-04-30", inflation_index_security: "No", floating_rate: "No", callable: "No", price_per100: "99.8", min_bid_amt: "100" }] });
    };
    const result = await treasuryBond("91282CJE2"); assert.equal(result?.fields.annualRate, "5"); assert.equal(result?.fields.family, "Sovereign");
    assert.equal(result?.fields.faceValuePerBond, undefined); assert.equal(result?.fields.currency, "USD");
    assert.equal(treasuryCusip("US172967KU42"), null); assert.equal(treasuryCusip("91282CJE3"), null);
  } finally { globalThis.fetch = original; }
});
test("OpenFIGI identification does not invent issuer country, currency or parse coupon from ticker", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json([{ data: [{ name: "CITIGROUP INC", marketSector: "Corp", securityType: "GLOBAL", ticker: "C 4.125 07/25/28" }] }]);
    const result = await openFigiBond("US172967KU42"); assert.equal(result?.instrumentName, "CITIGROUP INC"); assert.deepEqual(result?.fields, {});
    globalThis.fetch = async () => Response.json([{ data: [{ name: "ETF", marketSector: "Equity", securityType: "ETP" }] }]);
    assert.equal(await openFigiBond("IE00BV8C9B83"), null);
  } finally { globalThis.fetch = original; }
});
test("entry readiness checks required fields, coupon schedules, zero values and monetary relationships", () => {
  const empty = validateBondEntry(emptyBondFields()); assert.ok(empty.errors.identifier); assert.ok(empty.errors.currency);
  const complete = { ...emptyBondFields(), identifier: "US172967KU42", issuer: "Citigroup Inc.", issuerCountry: "United States", currency: "USD", family: "Corporate", structure: "Fixed", maturityDate: "2028-07-25", faceValuePerBond: "1000", annualRate: "4.125", frequency: "2", anchorDate: "2027-01-25", quantity: "1.5", totalPaid: "1490", purchaseAccruedPerBond: "10.43", settlementDate: "2026-10-23" };
  const autofilled = { ...complete, quantity: "", totalPaid: "", purchaseAccruedPerBond: "", settlementDate: "" };
  assert.ok(validateBondEntry(autofilled).errors.quantity);
  assert.ok(validateBondEntry({ ...complete, totalPaid: "abc" }).errors.totalPaid);
  const valid = validateBondEntry(complete); assert.deepEqual(valid.errors, {}); assert.equal(valid.parsed.success, true); assert.equal(valid.calculated?.accruedInterestPaid, "15.645");
  assert.ok(validateBondEntry({ ...complete, anchorDate: "2027-02-01" }).errors.anchorDate);
  assert.ok(validateBondEntry({ ...complete, maturityDate: "2025-01-01" }).errors.maturityDate);
  assert.ok(validateBondEntry({ ...complete, purchaseAccruedPerBond: "1000" }).errors.purchaseAccruedPerBond);
  assert.ok(validateBondEntry({ ...complete, settlementDate: "2099-01-01" }, "2026-10-23").errors.settlementDate);
  assert.ok(validateBondEntry({ ...complete, frequency: "" }).errors.frequency);
  assert.equal(validateBondEntry({ ...complete, structure: "Zero", purchaseAccruedPerBond: "", annualRate: "", frequency: "", anchorDate: "" }).parsed.success, true);
});

test("multi-country control cases use valid identifiers and never infer terms from country prefixes", async () => {
  const { bondCoverageCases, personalBondFields, unsupportedAutofillKeys } = await import("../fixtures/bond-coverage");
  const { validBondIdentifier } = await import("@/modules/portfolio/domain/international-bond");
  const noLiveData = async () => null;
  assert.equal(new Set(bondCoverageCases.map((s) => s.country)).size, 8);
  for (const sample of bondCoverageCases) {
    assert.ok(validBondIdentifier(sample.identifier), sample.identifier);
    const result = await lookupBond(sample.identifier, [noLiveData]);
    assert.deepEqual(unsupportedAutofillKeys(result.fields, sample), [], sample.identifier);
    for (const [key, actual] of Object.entries(result.fields)) {
      if (key === "anchorDate") assert.ok(sample.scheduledDays?.includes(actual.slice(5)));
      else assert.equal(actual, sample.expected[key], `${sample.identifier}: ${key}`);
    }
    for (const key of personalBondFields) assert.equal(key in result.fields, false);
    if (["Germany", "United Kingdom"].includes(sample.country) || sample.label.startsWith("Morgan Stanley")) assert.deepEqual(result.fields, {}, sample.identifier);
    if (sample.country !== "United States") assert.equal(treasuryCusip(sample.identifier), null);
  }
  const brazil = await lookupBond("US105756BK57", [noLiveData]);
  assert.equal(brazil.fields.issuerCountry, "Brazil"); assert.equal(brazil.fields.currency, "USD");
});
