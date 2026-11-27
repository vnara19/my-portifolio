import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveMovement, type MovementInput, type TrioField } from "@/modules/portfolio/domain/position-transactions";

function operation(patch: Partial<MovementInput> = {}): MovementInput {
  return {
    kind: "CONTRIBUTION",
    mode: "operation",
    totalTarget: "quantity",
    quoted: true,
    current: { quantity: 10, marketPrice: 30 },
    typed: { quantity: 2, unitPrice: 30, amount: 60, total: null },
    order: ["quantity", "unitPrice", "amount"],
    ...patch,
  };
}

test("invalid entered fields are not overwritten by inferred values", () => {
  for (const field of ["quantity", "unitPrice", "amount"] as TrioField[]) {
    for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]) {
      const input = operation();
      input.typed[field] = value;
      const result = resolveMovement(input);
      assert.ok(result.issue, `${field}=${String(value)} deveria bloquear`);
      assert.deepEqual(result.computed, []);
      assert.equal(result.after, 10);
      const received = field === "unitPrice" ? result.unitPrice : result[field];
      assert.ok(Object.is(received, value), `${field} was replaced`);
    }
  }
});

test("dividends accept missing or zero quantity without creating units", () => {
  for (const quantity of [null, 0]) {
    const result = resolveMovement(operation({
      kind: "INCOME",
      typed: { quantity, unitPrice: null, amount: 50, total: null },
      order: quantity === 0 ? ["amount", "quantity"] : ["amount"],
    }));
    assert.equal(result.issue, null);
    assert.equal(result.quantity, 0);
    assert.equal(result.unitPrice, null);
    assert.equal(result.amount, 50);
    assert.equal(result.after, 10);
    assert.equal(result.cashIncome, true);
  }
  const negativeQuantity = resolveMovement(operation({ kind: "INCOME", typed: { quantity: -1, unitPrice: null, amount: 50, total: null }, order: ["quantity", "amount"] }));
  assert.ok(negativeQuantity.issue);
  assert.equal(negativeQuantity.quantity, -1);
});

test("an untouched blank field remains inferable from the suggested quote", () => {
  const result = resolveMovement(operation({ typed: { quantity: 2, unitPrice: null, amount: null, total: null }, order: ["quantity"] }));
  assert.equal(result.issue, null);
  assert.equal(result.unitPrice, 30);
  assert.equal(result.amount, 60);
  assert.equal(result.suggestedPrice, true);
});

test("new totals ignore hidden fields but validate an entered execution price", () => {
  const input = operation({ mode: "total", typed: { quantity: -1, unitPrice: 25, amount: 0, total: 12 } });
  const result = resolveMovement(input);
  assert.equal(result.issue, null);
  assert.equal(result.quantity, 2);
  assert.equal(result.unitPrice, 25);
  assert.equal(result.amount, 50);
  for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    const invalid = resolveMovement({ ...input, typed: { ...input.typed, unitPrice: value } });
    assert.ok(invalid.issue);
    assert.ok(Object.is(invalid.unitPrice, value));
  }
});

test("manual balance mode validates only active fields", () => {
  const result = resolveMovement(operation({ quoted: false, typed: { quantity: -1, unitPrice: 0, amount: 500, total: null } }));
  assert.equal(result.issue, null);
  assert.equal(result.quantity, 500);
  assert.equal(result.after, 510);
  const total = resolveMovement(operation({ quoted: false, mode: "total", typed: { quantity: -1, unitPrice: -1, amount: -1, total: 100 } }));
  assert.equal(total.issue, null);
  assert.equal(total.amount, 90);
  assert.equal(total.after, 100);
  const invalidAmount = resolveMovement(operation({ quoted: false, typed: { quantity: 2, unitPrice: 30, amount: 0, total: null } }));
  assert.ok(invalidAmount.issue);
});

test("zero market value allows withdrawing the entire position", () => {
  const result = resolveMovement(operation({ kind: "WITHDRAWAL", mode: "total", totalTarget: "marketValue", typed: { quantity: null, unitPrice: null, amount: null, total: 0 }, order: [] }));
  assert.equal(result.issue, null);
  assert.equal(result.kind, "WITHDRAWAL");
  assert.equal(result.quantity, 10);
  assert.equal(result.amount, 300);
  assert.equal(result.after, 0);
});

test("opening balance corrections use market value without inventing purchase cost", () => {
  for (const [totalTarget, total] of [["quantity", 12], ["marketValue", 360]] as const) {
    const result = resolveMovement(operation({
      kind: "OPENING", mode: "total", totalTarget, current: { quantity: 2, marketPrice: 30 },
      typed: { quantity: -1, unitPrice: -1, amount: -1, total },
    }));
    assert.equal(result.issue, null);
    assert.equal(result.kind, "OPENING");
    assert.equal(result.quantity, 10);
    assert.equal(result.unitPrice, null);
    assert.equal(result.amount, 300);
    assert.equal(result.after, 12);
  }
});

test("nonfinite or unrecordable cent values cannot proceed", () => {
  const overflow = resolveMovement(operation({ typed: { quantity: 1e308, unitPrice: 1e308, amount: null, total: null }, order: ["quantity", "unitPrice"] }));
  assert.ok(overflow.issue);
  const underflow = resolveMovement(operation({ typed: { quantity: 1e-12, unitPrice: 0.001, amount: null, total: null }, order: ["quantity", "unitPrice"] }));
  assert.ok(underflow.issue);
});
