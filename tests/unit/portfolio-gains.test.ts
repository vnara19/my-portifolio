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
