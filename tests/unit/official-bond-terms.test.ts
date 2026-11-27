import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseNtma, parseGermanBond, parseEsm, parseFrenchBond, parseSpanishBond, officialDate } from "@/modules/quotes/infrastructure/official-bond-terms";
import { mergeBondSources } from "@/modules/portfolio/domain/bond-lookup";
const fixture = (name: string) => fs.readFileSync(`tests/fixtures/official-bonds/${name}.html`, "utf8");

test("French nominal values require the exact ISIN and unadjusted fixed-rate principal", () => {
  // Contractual fields from AFT's FR0014007L00 page, not a trading minimum.
  const page = "<dl><dt>ISIN Code</dt><dd>FR0014007L00</dd><dt>Type of security</dt><dd>Nominal, fixed rate</dd><dt>Currency of issue</dt><dd>Euro</dd><dt>Nominal value</dt><dd>1 Euro</dd><dt>Maturity date</dt><dd>25/05/2032</dd></dl>";
  assert.equal(parseFrenchBond(page, "FR0014007L00")?.fields.faceValuePerBond, "1");
  assert.equal(parseFrenchBond(page, "FR0014002WK3"), null);
  assert.equal(parseFrenchBond(page.replace("Nominal, fixed rate", "Inflation linked"), "FR0014007L00"), null);
  assert.equal(parseFrenchBond(page.replace("Nominal value", "Minimum purchase"), "FR0014007L00"), null);
  assert.equal(parseFrenchBond(page.replace("1 Euro", "0 Euro"), "FR0014007L00"), null);
  assert.equal(parseFrenchBond(page.replace("25/05/2032", "31/02/2032"), "FR0014007L00"), null);
  assert.equal(parseFrenchBond(page + " Nominal value 1000 Euro Maturity date 25/05/2032", "FR0014007L00"), null);
});
test("Spanish registry distinguishes debt nominal value from prices and issued balance", () => {
  // Registry row independently retrieved from CNMV; issued balance is not per-unit principal.
  const row = "<tr><td>ES0000012B88</td><td>ESTADO/1.40 OBESEGR 20280730 CAC</td><td>26.690.238.000,00</td><td>03/07/2018</td><td>30/07/2028</td><td>1.000,00</td><td>EUR</td><td>1,4000</td><td>DBFTFB</td></tr>";
  const page = `<table><tr><th>Nominal / VMN / Precio</th></tr>${row}</table>`;
  assert.equal(parseSpanishBond(page, "ES0000012B88")?.fields.faceValuePerBond, "1000");
  assert.equal(parseSpanishBond(page, "ES0000012B89"), null);
  assert.equal(parseSpanishBond(page.replace("DBFTFB", "ESVUFR"), "ES0000012B88"), null);
  assert.equal(parseSpanishBond(page.replace("1.000,00", "1,000.00"), "ES0000012B88"), null);
  assert.equal(parseSpanishBond(page.replace("EUR", "GBP"), "ES0000012B88"), null);
  assert.equal(parseSpanishBond(page.replace("</table>", row + "</table>"), "ES0000012B88"), null);
});

test("NTMA matches exact ISIN rows, complements issuer data and distinguishes zero coupons", () => {
  const page = fixture("ntma");
  const irish = parseNtma(page, "IE00BV8C9B83")!;
  assert.equal(irish.fields.annualRate, "1.7"); assert.equal(irish.fields.frequency, "1"); assert.equal(irish.fields.structure, "Fixed"); assert.equal(irish.fields.maturityDate, "2037-05-15");
  assert.equal(parseNtma(page, "IE00BKFVC568")?.fields.annualRate, "0.2");
  const zero = parseNtma(page, "IE00BMQ5JL65")!; assert.equal(zero.fields.structure, "Zero"); assert.equal(zero.fields.annualRate, undefined); assert.equal(zero.fields.frequency, undefined);
  assert.equal(irish.fields.faceValuePerBond, undefined);
  assert.equal(parseNtma(page, "US172967KU42"), null);
  assert.equal(parseNtma(page.replace("IE00BV8C9B83", "IE00BV8C9B84"), "IE00BV8C9B83"), null);
  assert.equal(parseNtma(page.replace("Treasury Bond Offering Circular", "Amortising Bond"), "IE00BV8C9B83"), null);
  const merged = mergeBondSources("IE00BV8C9B83", [irish, { name: "Other", url: "https://example.com", fields: { annualRate: "1.70", maturityDate: "2037-05-15" } }]);
  assert.deepEqual(merged.conflicts, []);
});
test("German factsheets verify instrument identity and issuer, never confuse minimum trade size with denomination", () => {
  const page = fixture("germany"), result = parseGermanBond(page, "DE0001102424")!;
  assert.equal(result.fields.annualRate, "0.5"); assert.equal(result.fields.frequency, "1"); assert.equal(result.fields.maturityDate, "2027-08-15"); assert.equal(result.fields.issuerCountry, "Germany"); assert.equal(result.fields.faceValuePerBond, undefined);
  assert.equal(parseGermanBond(page + "<table><tr><td>22.10.2026</td><td>99</td></tr><tr><td>22.10.2026</td><td>2</td></tr></table>", "DE0001102424")?.fields.annualRate, "0.5");
  assert.equal(parseGermanBond(page, "DE0001102481"), null);
  const zeroPage = "<h1>0,00% Bundesanleihe</h1>" + page.replace("0,50", "-");
  assert.equal(parseGermanBond(zeroPage, "DE0001102424")?.fields.structure, "Zero");
  assert.equal(parseGermanBond(page + "<table><tr><th>Kupon in %</th><td>9.0</td></tr></table>", "DE0001102424"), null);
  assert.equal(parseGermanBond(page.replace("Bundesrepublik Deutschland", "Example Corporate Issuer"), "DE0001102424"), null);
  assert.equal(parseGermanBond(page.replace("Bundesanleihe 10 Jahre", "Inflationsindexierte Bundesanleihe"), "DE0001102424")?.fields.structure, "Inflation");
});
test("official dates reject malformed/impossible values instead of rolling dates forward", () => {
  assert.equal(officialDate("15. August 2027"), "2027-08-15"); assert.equal(officialDate("15-May-2037"), "2037-05-15");
  assert.equal(officialDate("31/02/2037"), null); assert.equal(officialDate("05/15/2037"), null); assert.equal(officialDate("tomorrow"), null);
});
test("ESM combines matching reopenings but rejects conflicting terms and does not invent country/frequency", () => {
  const row = "<tr><td>ESM</td><td>EU000A1Z99R5</td><td>Bond</td><td>New</td><td>20/02/2023</td><td>3</td><td>EUR</td><td>5 year</td><td>15/03/2028</td><td>3.0</td></tr>";
  const result = parseEsm(`<table>${row}${row}</table>`, "EU000A1Z99R5")!;
  assert.equal(result.fields.issuer, "European Stability Mechanism"); assert.equal(result.fields.annualRate, "3"); assert.equal(result.fields.family, "Supranational"); assert.equal(result.fields.frequency, undefined); assert.equal(result.fields.issuerCountry, undefined);
  assert.equal(parseEsm(`<table>${row}${row.replace("3.0", "4.0")}</table>`, "EU000A1Z99R5"), null);
  assert.equal(parseEsm(`<table>${row}</table>`, "EU000A1Z99R6"), null);
});
