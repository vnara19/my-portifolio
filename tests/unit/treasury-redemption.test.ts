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
  assert.equal(row.net, 12537.71);
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
  assert.equal(row.net, 12051.30);
});


test("standard Treasury families calculate custody and net on a losing position", () => {
  const lot = { ...purchase, quantity: 10.33, amountBrl: 4995.69, occurredOn: "2026-11-17" };
  for (const type of ["PREFIXADO", "IPCA", "IGP-M"]) {
    const row = treasuryRedemptionRows([lot], "2026-11-23", 479.64, `TD:TESOURO-${type}:2032-01-01`, "2032-01-01")[0];
    assert.equal(row.gross, 4954.68);
    assert.equal(row.ir, 0);
    assert.equal(row.iof, 0);
    assert.equal(row.custody, 0.14); // D+1 settlement on Nov 18, five calendar days of custody.
    assert.equal(row.net, 4954.54);
  }
});

test("Selic exemption applies once across lots and all accounts", () => {
  const lot = { ...purchase, quantity: 1, amountBrl: 6000, occurredOn: "2026-01-05" };
  const calculateSelic = (stock?: number | null) => treasuryRedemptionRows([lot], "2026-02-05", 6000, "TD:TESOURO-SELIC:2031-03-01", "2031-03-01", stock)[0];
  assert.equal(calculateSelic().custody, 0);
  assert.equal(calculateSelic().net, 6000);
  assert.equal(calculateSelic(12000).custody, 0.16);
  assert.equal(calculateSelic(12000).net, 5999.84);
  assert.equal(calculateSelic(null).net, null);
  const rows = treasuryRedemptionRows([lot, { ...lot, id: "other" }], "2026-02-05", 6000, "TD:TESOURO-SELIC:2031-03-01", "2031-03-01");
  assert.deepEqual(rows.map(row => row.custody), [0.16, 0.16]);
});

test("new purchases wait for settlement and zero custody still produces a net value", () => {
  const lot = { ...purchase, quantity: 1, amountBrl: 1000, occurredOn: "2026-11-19" };
  const row = treasuryRedemptionRows([lot], "2026-11-23", 1000, "TD:TESOURO-PREFIXADO:2032-01-01", "2032-01-01")[0];
  assert.equal(row.custody, 0); // Nov 20 is a holiday, followed by the weekend.
  assert.equal(row.net, 1000);
});

test("Renda+ and Educa+ use their own settlement-based holding periods and lockups", () => {
  const lot = { ...purchase, quantity: 1, amountBrl: 1000, occurredOn: "2018-01-02" };
  const renda = treasuryRedemptionRows([lot], "2026-01-05", 1000, "TD:TESOURO-RENDA:2084-12-15", "2084-12-15")[0];
  const educa = treasuryRedemptionRows([lot], "2026-01-05", 1000, "TD:TESOURO-EDUCA:2044-12-15", "2044-12-15")[0];
  assert.ok(renda.custody! > educa.custody!);
  const young = { ...lot, occurredOn: "2025-12-15" };
  assert.equal(treasuryRedemptionRows([young], "2026-01-05", 1000, "TD:TESOURO-EDUCA:2044-12-15", "2044-12-15")[0].net, null);
});

test("coupon titles accrue custody since the last payment, without double charging past coupons", () => {
  const lot = { ...purchase, quantity: 1, amountBrl: 1000, occurredOn: "2026-01-05" };
  const rows = treasuryRedemptionRows([lot], "2026-08-01", 1000, "TD:TESOURO-PREFIXADO-COM-JUROS-SEMESTRAIS:2033-01-01", "2033-01-01");
  assert.equal(rows[0].custody, 0.17);
  assert.equal(rows[0].net, 999.83);
});


test("Renda+ and Educa+ custody switch at their settlement anniversaries", () => {
  const lot = { ...purchase, quantity: 1, amountBrl: 1000, occurredOn: "2010-01-04" };
  for (const [type, first, second] of [["RENDA", 10, 20], ["EDUCA", 7, 14]] as const) {
    for (const [year, rate] of [[2010 + first - 1, 0.5], [2010 + first, 0.2], [2010 + second, 0.1]]) {
      const asOf = `${year}-01-05`;
      const days = (Date.parse(asOf) - Date.parse("2010-01-05")) / 86400000;
      const row = treasuryRedemptionRows([lot], asOf, 1000, `TD:TESOURO-${type}:2084-12-15`, "2084-12-15")[0];
      assert.equal(row.custody, Math.round(1000 * rate * days / 36500 * 100) / 100);
    }
  }
});
