import assert from "node:assert/strict";
import { test } from "node:test";
import { convertBrl, reportingAmounts, reportingChange } from "@/modules/portfolio/domain/reporting-currency";

const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9);

test("FX alone changes USD balance and percentage without a BRL gain", () => {
  const before = reportingAmounts(1000, 5, 6);
  const after = reportingAmounts(1000, 4, 6);
  const change = reportingChange(after, before);
  close(after.USD, 250); close(change.amounts!.USD, 50); close(change.percentUsd, 25);
  close(change.amounts!.BRL, 0); close(change.amounts!.EUR, 0);
});

test("EUR appreciation increases USD value while the EUR holding stays unchanged", () => {
  const before = reportingAmounts(10 * 6, 5, 6);
  const after = reportingAmounts(10 * 6.6, 5, 6.6);
  const change = reportingChange(after, before);
  close(change.amounts!.USD, 1.2); close(change.amounts!.EUR, 0); close(change.percentUsd, 10);
});

test("contributions and investment growth both flow through USD reporting", () => {
  const before = reportingAmounts(500, 5, 6);
  const after = reportingAmounts(600 + 60, 4, 6);
  const change = reportingChange(after, before);
  close(change.amounts!.USD, 65); close(change.amounts!.EUR, 160 / 6); close(change.amounts!.BRL, 160);
  close(change.percentUsd, 65);
});

test("missing or invalid historical FX never borrows today's rate", () => {
  const change = reportingChange(reportingAmounts(600, 5, 6), reportingAmounts(500, null, null));
  assert.equal(change.percentUsd, null); assert.equal(change.amounts!.USD, null);
  assert.equal(change.amounts!.EUR, null); assert.equal(change.amounts!.BRL, 100);
  for (const rate of [null, 0, -1, Infinity, NaN]) assert.equal(convertBrl(100, rate), null);
});

test("zero baselines and absent periods do not invent a percentage", () => {
  assert.equal(reportingChange(reportingAmounts(100, 5, 6), reportingAmounts(0, 5, 6)).percentUsd, null);
  assert.deepEqual(reportingChange(reportingAmounts(100, 5, 6), null), { amounts: null, percentUsd: null });
  close(reportingChange(reportingAmounts(0, 5, 6), reportingAmounts(100, 5, 6)).percentUsd, -100);
});
