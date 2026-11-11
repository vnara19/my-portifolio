import assert from "node:assert/strict";
import { test } from "node:test";
import { portfolioGains, type GainMovement } from "@/modules/portfolio/domain/portfolio-gains";
const movement = (kind: GainMovement["kind"], quantity: number, amountBrl: number, usdRate: number | null = 5): GainMovement => ({ holding: "asset:account", kind, quantity, amountBrl, usdRate, transferId: null });
const snapshot = (quantity: number, valueUsd: number | null) => [{ holding: "asset:account", quantity, valueUsd }];
test("contributions are cost, not gains; USD FX appreciation is a gain", () => {
  const result = portfolioGains([movement("OPENING", 10, 500), movement("CONTRIBUTION", 10, 500)], snapshot(20, 250));
  assert.equal(result.unrealizedUsd, 50); assert.equal(result.unrealizedPercent, 25); assert.equal(result.realizedUsd, 0); assert.equal(result.totalUsd, 50);
});
test("partial sales remove average acquisition cost, including historical FX", () => {
  const result = portfolioGains([movement("OPENING", 10, 500), movement("CONTRIBUTION", 10, 800, 4), movement("WITHDRAWAL", 5, 400, 4)], snapshot(15, 240));
  assert.equal(result.realizedUsd, 25); assert.equal(result.unrealizedUsd, 15); assert.equal(result.totalUsd, 40);
});
test("fully sold holdings retain realized losses", () => {
  assert.equal(portfolioGains([movement("OPENING", 10, 500), movement("WITHDRAWAL", 10, 400)], []).totalUsd, -20);
});
test("paid income is realized while capitalized income remains in holding value", () => {
  const result = portfolioGains([movement("OPENING", 10, 500), movement("INCOME", 1, 50), movement("INCOME", 0, 25)], snapshot(11, 110));
  assert.equal(result.unrealizedUsd, 10); assert.equal(result.realizedUsd, 5); assert.equal(result.totalUsd, 15);
});
test("unknown costs, missing FX, unmatched quantities and transfers do not invent gains", () => {
  for (const entries of [[], [movement("OPENING", 10, 500, null)], [movement("OPENING", 5, 500)], [{ ...movement("OPENING", 10, 500), transferId: "transfer" }], [movement("WITHDRAWAL", 10, 500)]]) {
    assert.equal(portfolioGains(entries, snapshot(10, 120)).totalUsd, null);
  }
  assert.equal(portfolioGains([movement("OPENING", 10, 500)], snapshot(10, null)).totalUsd, null);
});

test("missing gain reasons distinguish absent FX from inconsistent holdings", () => {
  const reasons: string[] = [];
  portfolioGains([movement("CONTRIBUTION", 10, 500, null)], snapshot(10, 120), reason => reasons.push(reason));
  portfolioGains([movement("CONTRIBUTION", 9, 500)], snapshot(10, 120), reason => reasons.push(reason));
  assert.deepEqual(reasons, ["historical-fx", "ledger-mismatch"]);
});

test("commissions on open purchases increase historical cost without changing total P&L", () => {
 const buy={...movement("CONTRIBUTION",1,525),feeBrl:25};
 const result=portfolioGains([buy],snapshot(1,110));
 assert.equal(result.unrealizedUsd,5);assert.equal(result.realizedUsd,0);assert.equal(result.totalUsd,5);
 assert.equal(result.realizedPercent,0);
 assert.equal(result.totalUsd,portfolioGains([{...buy,feeBrl:0}],snapshot(1,110)).totalUsd);
});
test("sale proceeds already include fees, so commissions are never deducted twice",()=>{
 const result=portfolioGains([{...movement("CONTRIBUTION",1,525),feeBrl:25},{...movement("WITHDRAWAL",1,620),feeBrl:30}],[]);
 assert.equal(result.realizedUsd,19);assert.equal(result.totalUsd,19);
 assert.ok(Math.abs(result.realizedPercent!-(19/105*100))<1e-10);
});

test("reporting-currency gains are not current-FX conversions of each other",()=>{
 // EUR 1,000 invested when EUR/USD=1.20; now EUR 1,100 at EUR/USD=1.10.
 const euro=portfolioGains([movement("CONTRIBUTION",1,6000,6)],snapshot(1,1100));
 const dollar=portfolioGains([movement("CONTRIBUTION",1,6000,5)],snapshot(1,1210));
 assert.equal(euro.unrealizedUsd,100);
 assert.equal(dollar.unrealizedUsd,10);
 assert.equal(euro.unrealizedPercent,10);
 assert.ok(Math.abs(dollar.unrealizedPercent!-10/1200*100)<1e-10);
});

test("composition reconciles multiple FX lots and fees after a partial sale", () => {
  const result: import("@/modules/portfolio/domain/portfolio-gains").GainComposition[] = [];
  const gains = portfolioGains([
    { ...movement("CONTRIBUTION", 1, 610), feeBrl: 10, nativePurchase: { currency: "EUR", price: 100, usdPerUnit: 1.2 } },
    { ...movement("CONTRIBUTION", 1, 550), nativePurchase: { currency: "EUR", price: 100, usdPerUnit: 1.1 } },
    movement("WITHDRAWAL", 1, 650),
  ], [{ ...snapshot(1, 132)[0], native: { currency: "EUR", total: 120 } }], undefined, undefined, row => result.push(row));
  const [row] = result;
  assert.equal(row.costUsd, 116);
  assert.equal(row.priceUsd, 23);
  assert.equal(row.fxUsd, -6);
  assert.equal(row.adjustmentUsd, -1);
  assert.equal(row.priceUsd + row.fxUsd + row.adjustmentUsd, gains.unrealizedUsd);
  assert.equal(row.percent, gains.unrealizedPercent);
  assert.equal(gains.realizedUsd, 14);
});

test("displayed composition reconciles to the displayed unrealized gain at cent precision", () => {
  const parts: import("@/modules/portfolio/domain/portfolio-gains").GainComposition[] = [];
  const gains = portfolioGains([
    { ...movement("CONTRIBUTION", 1, 500), nativePurchase: { currency: "EUR", price: 100, usdPerUnit: 1 } },
  ], [{ ...snapshot(1, 100.008)[0], native: { currency: "EUR", total: 100.004 } }],
  undefined, undefined, result => parts.push(result));
  assert.equal(gains.unrealizedUsd, 0.01);
  assert.equal(parts[0].totalUsd, 0.01);
  assert.equal(parts[0].priceUsd + parts[0].fxUsd + parts[0].adjustmentUsd, 0.01);
});

test("paired custody movements retain historical basis and do not realize proceeds", () => {
  const source = movement("CONTRIBUTION", 10, 500);
  const shared = { transferId: "move-1", assetId: "etf", day: "2026-11-11" };
  const debit = { ...movement("WITHDRAWAL", 4, 1000, null), ...shared };
  const credit = { ...movement("CONTRIBUTION", 4, 1000, null), ...shared, holding: "other:account" };
  const sale = { ...movement("WITHDRAWAL", 1, 75), holding: credit.holding };
  const held = [...snapshot(6, 90), { holding: credit.holding, quantity: 3, valueUsd: 45 }];
  const gains = portfolioGains([source, credit, debit, sale], held);
  assert.equal(gains.unrealizedUsd, 45);
  assert.equal(gains.realizedUsd, 5);
  assert.equal(gains.totalUsd, 50);
  assert.equal(portfolioGains([source, debit, { ...credit, assetId: "different" }], held).totalUsd, null);
  assert.equal(portfolioGains([source, debit], held).totalUsd, null);
});
