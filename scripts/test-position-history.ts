import assert from "node:assert/strict";

import {
  buildHistorySlots,
  summarizeHistory,
  type PositionObservation,
} from "../src/modules/portfolio/domain/position-history";
import {
  recordedByMonth,
  type RecordedMovement,
} from "../src/modules/portfolio/domain/position-transactions";


function observation(month: string, quantity: number, price: number | null, opening?: number, movements?: RecordedMovement[]): PositionObservation {
  return {
    month,
    accountId: "account",
    accountLabel: "Account",
    quantity,
    openingQuantity: opening,
    unitPriceBrl: price,
    totalBrl: price === null ? quantity : Math.round(quantity * price * 100) / 100,
    strategy: null,
    allocations: [],
    recorded: movements === undefined ? null : recordedByMonth(movements.map((entry) => ({ ...entry, month }))).get(month),
  };
}

function movement(kind: RecordedMovement["kind"], quantity: number, amountBrl: number, day = "2026-10-01", transferId: string | null = null): RecordedMovement {
  return { kind, quantity, amountBrl, occurredOn: day, transferId };
}

function history(observations: PositionObservation[], quoted: boolean) {
  const months = [...new Set(observations.map((entry) => entry.month))].map((month) => ({ month, totalBrl: 50_000 }));
  const slots = buildHistorySlots({ months, observations, scopeAccountId: null, quoted });
  return { slots, summary: summarizeHistory(slots, months.at(-1)!.month, quoted) };
}

// Legacy estimates retain the invested-capital curve.
{
  const { slots, summary } = history([
    observation("2026-09", 10, 20),
    observation("2026-10", 12, 25),
  ], true);
  assert.equal(summary.priceGainBrl, 50);
  assert.equal(summary.flowsBrl, 50);
  assert.equal(summary.costBasisBrl, 250);
  assert.equal(summary.costSource, "estimated");
  assert.equal(slots[1].kind === "present" && slots[1].appliedBrl, 250);
  const manual = history([observation("2026-09", 1000, null), observation("2026-10", 1100, null)], false);
  assert.equal(manual.summary.priceGainBrl, null);
  assert.equal(manual.summary.flowsBrl, null);
}


{
  const { slots, summary } = history([
    observation("2026-10", 1300, null, 1000, [movement("CONTRIBUTION", 300, 300)]),
    observation("2026-11", 1250, null, 1200, [movement("CONTRIBUTION", 50, 50, "2026-11-01")]),
  ], false);
  assert.equal(summary.startValueBrl, 1000);
  assert.equal(summary.flowsBrl, 350);
  assert.equal(summary.priceGainBrl, 0);
  assert.equal(summary.unexplainedBrl, -100);
  assert.equal(summary.incomeBrl, 0);
  assert.equal(slots[1].kind === "present" && slots[1].step?.unexplainedBrl, -100);
  assert.equal(slots[1].kind === "present" && slots[1].openingQuantity, 1200);
}


{
  const { summary } = history([observation("2026-10", 2, 30, 0, [movement("CONTRIBUTION", 2, 50)])], true);
  assert.equal(summary.startValueBrl, 0);
  assert.equal(summary.flowsBrl, 50);
  assert.equal(summary.priceGainBrl, 10);
  assert.equal(summary.unexplainedBrl, 0);
  assert.equal(summary.averagePriceBrl, 25);
  assert.equal(summary.costBasisBrl, 50);
  assert.equal(summary.costSource, "known");
}


{
  const { summary } = history([observation("2026-10", 10, 20, 0, [movement("OPENING", 10, 200)])], true);
  assert.equal(summary.startValueBrl, 200);
  assert.equal(summary.flowsBrl, 0);
  assert.equal(summary.priceGainBrl, 0);
  assert.equal(summary.recorded?.openingBrl, 200);
  assert.equal(summary.averagePriceBrl, null);
  assert.equal(summary.costSource, "unknown");
  const tiny = history([observation("2026-10", 1e-10, 100, 1e-10, [movement("INCOME", 0, 1)])], true);
  assert.equal(tiny.summary.costSource, "unknown");
}


{
  const { summary } = history([observation("2026-10", 10, 30, 10, [movement("INCOME", 0, 5)])], true);
  assert.equal(summary.incomeBrl, 5);
  assert.equal(summary.capitalizedIncomeBrl, 0);
  assert.equal(summary.endValueBrl, 300);
  assert.equal(summary.priceGainBrl, 0);
  assert.equal(summary.unexplainedBrl, 0);
}


{
  const { summary } = history([observation("2026-10", 1020, null, 1000, [movement("INCOME", 20, 20)])], false);
  assert.equal(summary.incomeBrl, 20);
  assert.equal(summary.capitalizedIncomeBrl, 20);
  assert.equal(summary.flowsBrl, 0);
  assert.equal(summary.unexplainedBrl, 0);
}


{
  const outgoing = movement("WITHDRAWAL", 10200, 10200, "2026-10-02", "transfer");
  const incoming = movement("CONTRIBUTION", 10200, 10200, "2026-10-02", "transfer");
  const totals = recordedByMonth([outgoing, incoming].map((entry) => ({ ...entry, month: "2026-10" }))).get("2026-10")!;
  assert.equal(totals.netFlowBrl, 0);
  assert.equal(totals.contributionsBrl, 0);
  assert.equal(totals.withdrawalsBrl, 0);
  assert.equal(totals.internalBrl, 0);
  const { summary } = history([observation("2026-10", 11000, null, 800, [incoming])], false);
  assert.equal(summary.internalBrl, 10200);
  assert.equal(summary.flowsBrl, 0);
  assert.equal(summary.unexplainedBrl, 0);
}


{
  const { summary } = history([
    observation("2026-09", 10, 20, 0, [movement("CONTRIBUTION", 10, 200, "2026-09-01")]),
    observation("2026-10", 5, 25, 10, [movement("WITHDRAWAL", 5, 150)]),
  ], true);
  assert.equal(summary.flowsBrl, 50);
  assert.equal(summary.priceGainBrl, 75);
  assert.equal(summary.averagePriceBrl, 20);
  assert.equal(summary.costBasisBrl, 100);
  assert.equal(summary.unexplainedBrl, 0);
}


{
  const { summary } = history([observation("2026-10", 2, 30, 10, [
    movement("CONTRIBUTION", 2, 50, "2026-10-03"),
    movement("WITHDRAWAL", 10, 300, "2026-10-02"),
  ])], true);
  assert.equal(summary.costSource, "known");
  assert.equal(summary.averagePriceBrl, 25);
  assert.equal(summary.costBasisBrl, 50);
}


{
  const { slots, summary } = history([
    observation("2026-10", 1300, null, 1000, [movement("CONTRIBUTION", 300, 300)]),
    observation("2026-11", 1200, null, 1200),
  ], false);
  assert.equal(summary.flowsBrl, 300);
  assert.equal(summary.unexplainedBrl, -100);
  assert.equal(slots[1].kind === "present" && slots[1].step?.source, "mixed");
}

console.log("Financial history: 10 scenarios passed without a database.");
