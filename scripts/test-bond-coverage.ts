/** Read-only live-provider audit. Run manually; never part of network-free unit tests. */
import assert from "node:assert/strict";
import { lookupBond } from "@/modules/portfolio/application/lookup-bond";
import { validBondIdentifier } from "@/modules/portfolio/domain/international-bond";
import { bondCoverageCases, personalBondFields, unsupportedAutofillKeys, type BondCoverageCase } from "../tests/fixtures/bond-coverage";

function isinOf(cusip: string) {
  for (let digit = 0; digit <= 9; digit++) if (validBondIdentifier(`US${cusip}${digit}`)) return `US${cusip}${digit}`;
  throw new Error("Invalid Treasury CUSIP");
}
const treasuries: BondCoverageCase[] = [
  { identifier: isinOf("91282CKQ3"), country: "United States", label: "Treasury Note 4.375% 2034", expected: { issuer: "U.S. Treasury", issuerCountry: "United States", family: "Sovereign", currency: "USD", structure: "Fixed", maturityDate: "2034-05-15", annualRate: "4.375", frequency: "2" }, scheduledDays: ["05-15", "11-15"], minimumFields: 9, source: "https://www.treasurydirect.gov/instit/annceresult/press/preanre/2024/R_20240710_2.pdf" },
  { identifier: isinOf("91282CJY8"), country: "United States", label: "Treasury TIPS 2034", expected: { issuer: "U.S. Treasury", issuerCountry: "United States", family: "Sovereign", currency: "USD", structure: "Inflation", maturityDate: "2034-01-15" }, minimumFields: 6, source: "https://treasurydirect.gov/instit/annceresult/tipscpi/2025/CPI_20250715.pdf" },
];
async function main() {
const results = [];
for (const sample of [...bondCoverageCases, ...treasuries]) {
  assert.ok(validBondIdentifier(sample.identifier), sample.identifier);
  const result = await lookupBond(sample.identifier);
  const errors: string[] = [];
  for (const [key, actual] of Object.entries(result.fields)) {
    if (key === "anchorDate" && sample.scheduledDays?.includes(actual.slice(5))) continue;
    const expected = sample.expected[key];
    if (expected === undefined || (/annualRate|faceValuePerBond/.test(key) ? Number(actual) !== Number(expected) : actual !== expected)) errors.push(`${key}: ${actual} != ${expected ?? "must remain blank"}`);
  }
  assert.deepEqual(unsupportedAutofillKeys(result.fields, sample), []);
  for (const key of personalBondFields) assert.equal(key in result.fields, false);
  const fields = Object.keys(result.fields);
  const available = fields.length >= sample.minimumFields && (fields.length > 0 || Boolean(result.instrumentName));
  const row = { country: sample.country, label: sample.label, identifier: sample.identifier, instrumentName: result.instrumentName ?? null, fields: result.fields, status: errors.length ? "incorrect" : !available ? "incomplete" : fields.length ? "partial-terms" : result.instrumentName ? "identification-only" : "no-data", errors, unavailable: result.unavailable, source: sample.source };
  results.push(row); console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ summary: { cases: results.length, countries: new Set(results.map((r) => r.country)).size, incorrect: results.filter((r) => r.errors.length).length, incomplete: results.filter((r) => r.status === "incomplete").length, terms: results.filter((r) => r.status === "partial-terms").length, identificationOnly: results.filter((r) => r.status === "identification-only").length, noData: results.filter((r) => r.status === "no-data").length } }));
if (results.some((r) => r.errors.length || r.status === "incomplete")) process.exitCode = 1;

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
