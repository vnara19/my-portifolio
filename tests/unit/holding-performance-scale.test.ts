import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDisplayedHoldingGain, holdingPerformanceScale } from "@/modules/portfolio/presentation/holding-performance-scale";

test("holding performance hides unavailable and rounded-zero results", () => {
  for (const value of [null, 0, -0, 1e-10, -0.0049, NaN, Infinity]) assert.equal(hasDisplayedHoldingGain(value), false);
  for (const value of [-40.06, 17.48, -0.005, 0.005]) assert.equal(hasDisplayedHoldingGain(value), true);
});

test("shared bar scale covers both signs and keeps evenly spaced labelled ticks", () => {
  for (const values of [[17.48, -40.06], [0.02, -0.01], [10000, -6000], []]) {
    const scale = holdingPerformanceScale(values);
    assert.ok(scale.maximum > 0);
    assert.ok(values.every(value => Math.abs(value) <= scale.maximum));
    assert.equal(scale.ticks[0], 0);
    assert.equal(scale.ticks.at(-1), scale.maximum);
    assert.ok(Math.abs(scale.ticks[2] - scale.ticks[1] * 2) < 1e-10);
  }
});
