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

test("commissions on open purchases are realized expenses without changing total P&L", () => {
 const buy={...movement("CONTRIBUTION",1,525),feeBrl:25};
 const result=portfolioGains([buy],snapshot(1,110));
 assert.equal(result.unrealizedUsd,10);assert.equal(result.realizedUsd,-5);assert.equal(result.totalUsd,5);
 assert.ok(Math.abs(result.realizedPercent!-(-5/105*100))<1e-10);
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
