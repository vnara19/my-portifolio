import assert from "node:assert/strict";
import { test } from "node:test";
import { treasuryRedemptionRows } from "../../src/modules/portfolio/domain/treasury-redemption";

const purchase = { id: "lot", occurredOn: "2025-03-27", kind: "CONTRIBUTION", quantity: 81,
  amountBrl: 12418.92, unitPriceBrl: 153.32, note: " Treasury IPCA 7.23% p.a." };
const symbol = "TD:TESOURO-RENDA-APOSENTADORIA-EXTRA:2084-12-15";
const calculate = (price: number | null, entries = [purchase]) =>
  treasuryRedemptionRows(entries, "2026-11-11", price, symbol, "2084-12-15")[0];

test("reconciles a RendA+ purchase from recorded cost and a BRL quote", () => {
  const row = calculate(156.64);
  assert.equal(row.gross, 12687.84);
  assert.equal(row.taxRate, 17.5);
  assert.equal(row.ir, 47.06);
  assert.equal(row.iof, 0);
  assert.equal(row.contracted?.rate, 7.23);
  assert.equal(row.net, 12537.54);
});

test("avoids inventing the remaining value when the quote or lot history is incomplete", () => {
  assert.equal(calculate(null).net, null);
  assert.equal(calculate(156.64, [purchase, { ...purchase, kind: "WITHDRAWAL" }]).gross, null);
});

test("reads the recorded contracted rate even when FX audit metadata follows it", () => {
  const note = purchase.note + " USD valuation FX: 0.18 USD/BRL on 2025-03-27.";
  assert.deepEqual(calculate(156.64, [{ ...purchase, note }]).contracted, { indexer: "IPCA", rate: 7.23 });
});

test("a loss has no income tax while custody still applies", () => {
  const row = calculate(150);
  assert.equal(row.taxRate, 17.5);
  assert.equal(row.ir, 0);
  assert.equal(row.iof, 0);
  assert.ok(row.custody! > 0);
  assert.equal(row.net, 12051.14);
});
