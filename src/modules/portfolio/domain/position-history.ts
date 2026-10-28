
/** Build monthly history across accounts using average cost. Missing months, partial withdrawals and liquidations retain their distinct financial meaning. */

//


// Keep zero balances in historical periods.
//
import { emptyRecordedMonth, type RecordedMonth } from "./position-transactions";


export type HistorySource = "estimated" | "recorded" | "mixed";

export type ObservedAllocation = {
  assetClass: string;
  subclass: string;
  duration: string;
  /** Percentage weight (0 to 100). */
  weight: number;
};

export type PositionObservation = {

  month: string;
  accountId: string;

  accountLabel: string;
  quantity: number;

  openingQuantity?: number;

  recorded?: RecordedMonth | null;
  unitPriceBrl: number | null;
  totalBrl: number;
  strategy: string | null;
  allocations: ObservedAllocation[];
};

export type PortfolioMonthTotal = {
  month: string;
  totalBrl: number;
};

export type AllocationSlice = ObservedAllocation & {
  valueBrl: number;
};

export type HistoryStep = {
  source?: HistorySource;

  fromMonth: string;

  acrossMissing: boolean;
  changeBrl: number;
  changePercent: number | null;

  priceEffectBrl: number | null;

  flowBrl: number | null;

  pricePercent: number | null;

  incomeBrl?: number;

  capitalizedIncomeBrl?: number;
  internalBrl?: number;
  openingBrl?: number;

  unexplainedBrl?: number;
};

export type MissingSlot = { kind: "missing"; month: string };

export type AbsentSlot = {
  kind: "absent";
  month: string;
  portfolioTotalBrl: number;

  elsewhere: string[];

  exitBrl: number | null;
};

export type PresentSlot = {
  kind: "present";
  month: string;
  portfolioTotalBrl: number;
  quantity: number;
  openingQuantity: number | null;
  recorded: RecordedMonth | null;
  source: HistorySource;
  priceBrl: number | null;
  valueBrl: number;

  share: number;
  accounts: string[];
  strategy: string | null;
  allocations: AllocationSlice[];

  entryBrl: number | null;
  step: HistoryStep | null;


  appliedBrl: number | null;

  appliedUnits: number | null;

  appliedFromOpening: boolean;


  realizedBrl: number | null;

  gainBrl: number | null;


  liquidated: boolean;

  liquidatedOn: string | null;
};

export type HistorySlot = MissingSlot | AbsentSlot | PresentSlot;

export type StepHighlight = HistoryStep & { month: string };

export type PositionSummary = {
  selectedMonth: string;

  state: "present" | "absent" | "before" | "never";
  firstMonth: string | null;
  lastPresentMonth: string | null;

  previousMonth: string | null;
  previousPresent: boolean;
  current: PresentSlot | null;
  shareChange: number | null;
  monthStep: StepHighlight | null;




  best: StepHighlight | null;
  worst: StepHighlight | null;
  averagePriceBrl: number | null;
  costBasisBrl: number | null;


  costSource?: "estimated" | "known" | "opening";

  appliedBrl?: number | null;

  gainBrl?: number | null;
};

const EPSILON = 1e-9;

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function monthFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}


export function calendarMonths(first: string, last: string) {
  const months: string[] = [];
  const end = monthFromKey(last).getTime();
  let cursor = monthFromKey(first);

  while (cursor.getTime() <= end) {
    months.push(monthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}


export function buildHistorySlots({
  months,
  observations,
  scopeAccountId,
  quoted,
}: {
  months: PortfolioMonthTotal[];
  observations: PositionObservation[];
  scopeAccountId: string | null;
  quoted: boolean;
}): HistorySlot[] {
  if (months.length === 0) {
    return [];
  }

  const sorted = [...months].sort((left, right) => left.month.localeCompare(right.month));
  const totals = new Map(sorted.map((entry) => [entry.month, entry.totalBrl]));
  const byMonth = new Map<string, PositionObservation[]>();

  for (const observation of observations) {
    const list = byMonth.get(observation.month) ?? [];
    list.push(observation);
    byMonth.set(observation.month, list);
  }

  const slots: HistorySlot[] = [];
  let previous: PresentSlot | null = null;
  let broken = false;
  let missingSincePrevious = false;
  let applied: number | null = null;

  let cost: Cost | null = null;

  // Preserve exit and re-entry history (spec 076).
  let realized: number | null = null;

  for (const month of calendarMonths(sorted[0].month, sorted.at(-1)!.month)) {
    const portfolioTotal = totals.get(month);

    if (portfolioTotal === undefined) {
      slots.push({ kind: "missing", month });
      missingSincePrevious = true;
      continue;
    }

    const monthObservations = byMonth.get(month) ?? [];
    const inScope = monthObservations.filter(
      (observation) => scopeAccountId === null || observation.accountId === scopeAccountId,
    );

    if (inScope.length === 0) {
      const exitBrl: number | null = previous && !broken && previous.source === "estimated" ? -previous.valueBrl : null;

      if (exitBrl !== null && applied !== null) {
        applied += exitBrl;
      }

      slots.push({
        kind: "absent",
        month,
        portfolioTotalBrl: portfolioTotal,
        elsewhere: [...new Set(monthObservations.map((observation) => observation.accountLabel))],
        exitBrl,
      });

      if (previous) {
        broken = true;
      }

      cost = null;
      continue;
    }

    const slot = aggregate(month, portfolioTotal, inScope, quoted);
    const appliedBefore = applied;

    if (!previous) {
      applied = quoted && slot.source === "estimated" ? slot.valueBrl : null;
      if (slot.recorded) {
        slot.step = computeRecordedStep(null, slot, false, quoted);
      }
    } else if (broken) {
      slot.entryBrl = slot.source === "estimated" && previous.source === "estimated" ? slot.valueBrl : null;

      if (slot.entryBrl !== null && applied !== null) {
        applied += slot.valueBrl;
      }
      if (slot.recorded) {
        slot.step = computeRecordedStep(null, slot, missingSincePrevious, quoted);
      }
    } else {
      slot.step = computeStep(previous, slot, missingSincePrevious, quoted);

      if (applied !== null && slot.step.flowBrl !== null) {
        applied += slot.step.flowBrl;
      }
    }

    if (slot.recorded) {


      const base = slot.openingQuantity ?? slot.quantity - slot.recorded.quantityDelta - slot.recorded.openingQuantity;
      if (!cost) {
        const carried = previous && !broken ? appliedBefore ?? previous.valueBrl : quoted ? base * (slot.priceBrl ?? 0) : base;
        cost = { value: base > QUANTITY_TOLERANCE ? carried : 0, units: base, fromOpening: base > QUANTITY_TOLERANCE };
      } else if (Math.abs(base - cost.units) > QUANTITY_TOLERANCE) {

        cost.units = base;
      }
      realized = roundCents((realized ?? 0) + applyMovements(cost, slot.recorded));
      applied = roundCents(cost.value);
      slot.appliedUnits = cost.units;
      slot.appliedFromOpening = cost.fromOpening;
      slot.realizedBrl = realized;
      const exit = liquidationOf(slot);
      slot.liquidated = exit !== null;
      slot.liquidatedOn = exit;
    } else {
      cost = null;
      if (slot.source !== "estimated" || (slot.step && slot.step.source !== "estimated")) {
        applied = null;
      }
      slot.appliedUnits = applied === null ? null : slot.quantity;
    }
    slot.appliedBrl = applied;
    slot.gainBrl = applied === null ? null : roundCents(slot.valueBrl - applied + (slot.realizedBrl ?? 0));
    slots.push(slot);
    previous = slot;
    broken = false;
    missingSincePrevious = false;
  }

  return slots;
}

function aggregate(
  month: string,
  portfolioTotal: number,
  observations: PositionObservation[],
  quoted: boolean,
): PresentSlot {
  const quantity = observations.reduce((total, observation) => total + observation.quantity, 0);
  const openingQuantity = observations.every((entry) => entry.openingQuantity !== undefined)
    ? observations.reduce((total, entry) => total + entry.openingQuantity!, 0)
    : null;
  const recordedObservations = observations.filter((entry) => entry.recorded != null);
  const recorded = recordedObservations.length > 0
    ? mergeRecordedMonths(recordedObservations.map((entry) => entry.recorded!))
    : null;
  const source: HistorySource = !recorded ? "estimated" : recordedObservations.length === observations.length ? "recorded" : "mixed";
  const valueBrl = roundCents(observations.reduce((total, observation) => total + observation.totalBrl, 0));
  const priced = observations.filter((observation) => observation.unitPriceBrl !== null);


  const priceBrl =
    quoted && priced.length === observations.length && quantity > EPSILON
      ? priced.reduce((total, observation) => total + observation.quantity * observation.unitPriceBrl!, 0) / quantity
      : quoted && priced.length > 0
        ? priced[0].unitPriceBrl
        : null;

  const slices = new Map<string, AllocationSlice>();

  for (const observation of observations) {
    for (const allocation of observation.allocations) {
      const key = `${allocation.assetClass}\u0000${allocation.subclass}\u0000${allocation.duration}`;
      const current = slices.get(key) ?? { ...allocation, weight: 0, valueBrl: 0 };
      current.valueBrl += (observation.totalBrl * allocation.weight) / 100;
      slices.set(key, current);
    }
  }

  const allocations = [...slices.values()]
    .map((slice) => ({ ...slice, weight: valueBrl === 0 ? 0 : (slice.valueBrl / valueBrl) * 100 }))
    .sort((left, right) => right.valueBrl - left.valueBrl);

  const largest = [...observations].sort((left, right) => right.totalBrl - left.totalBrl)[0];

  return {
    kind: "present",
    month,
    portfolioTotalBrl: portfolioTotal,
    quantity,
    openingQuantity,
    recorded,
    source,
    priceBrl,
    valueBrl,
    share: portfolioTotal === 0 ? 0 : (valueBrl / portfolioTotal) * 100,
    accounts: [...new Set(observations.map((observation) => observation.accountLabel))],
    strategy: largest.strategy,
    allocations,
    entryBrl: null,
    step: null,
    appliedBrl: null,
    appliedUnits: null,
    appliedFromOpening: false,
    realizedBrl: null,
    gainBrl: null,
    liquidated: false,
    liquidatedOn: null,
  };
}


function liquidationOf(slot: PresentSlot) {
  if (slot.quantity > QUANTITY_TOLERANCE || !slot.recorded) {
    return null;
  }

  const exit = slot.recorded.movements.findLast((entry) => entry.kind === "WITHDRAWAL");
  return exit ? (exit.occurredOn ?? `${slot.month}-01`) : null;
}

const QUANTITY_TOLERANCE = 5e-13;

type Cost = { value: number; units: number; fromOpening: boolean };


function applyMovements(cost: Cost, recorded: RecordedMonth) {
  let realized = 0;

  for (const entry of recorded.movements) {
    const moved = entry.quantity ?? 0;

    if (entry.kind === "OPENING") {
      cost.value += entry.amountBrl;
      cost.units += moved;
      cost.fromOpening = true;
    } else if (entry.kind === "CONTRIBUTION") {
      cost.value += entry.amountBrl;
      cost.units += moved;
    } else if (entry.kind === "WITHDRAWAL") {
      const removed = cost.units > QUANTITY_TOLERANCE ? cost.value * Math.min(moved / cost.units, 1) : 0;
      cost.value -= removed;
      cost.units -= moved;
      realized += entry.amountBrl - removed;
    } else {
      cost.units += entry.amountBrl < 0 ? -moved : moved;
    }

    if (cost.units <= QUANTITY_TOLERANCE) {
      cost.units = 0;
      cost.value = 0;
    }
  }

  return realized;
}

function computeStep(previous: PresentSlot, current: PresentSlot, acrossMissing: boolean, quoted: boolean): HistoryStep {
  if (current.recorded || previous.recorded) {
    return computeRecordedStep(previous, current, acrossMissing, quoted);
  }
  const changeBrl = roundCents(current.valueBrl - previous.valueBrl);
  const hasPrices = quoted && previous.priceBrl !== null && current.priceBrl !== null;
  const priceEffectBrl = hasPrices ? roundCents(previous.quantity * (current.priceBrl! - previous.priceBrl!)) : null;

  return {
    source: "estimated",
    fromMonth: previous.month,
    acrossMissing,
    changeBrl,
    changePercent: Math.abs(previous.valueBrl) < EPSILON ? null : (changeBrl / previous.valueBrl) * 100,
    priceEffectBrl,
    flowBrl: priceEffectBrl === null ? null : roundCents(changeBrl - priceEffectBrl),
    pricePercent:
      hasPrices && Math.abs(previous.priceBrl!) > EPSILON ? (current.priceBrl! / previous.priceBrl! - 1) * 100 : null,
  };
}


function computeRecordedStep(previous: PresentSlot | null, current: PresentSlot, acrossMissing: boolean, quoted: boolean): HistoryStep {
  const recorded = current.recorded ?? emptyRecordedMonth();
  const base = current.openingQuantity ?? current.quantity - recorded.quantityDelta - recorded.openingQuantity;
  const baselinePrice = previous?.priceBrl ?? current.priceBrl;
  const baselineValue = quoted ? baselinePrice === null ? null : base * baselinePrice : base;
  const openingBrl = previous ? recorded.openingBrl : 0;
  const start = previous?.valueBrl ?? (baselineValue ?? 0) + recorded.openingBrl;
  const changeBrl = roundCents(current.valueBrl - start);
  const hasMovementQuantities = recorded.movements.every((entry) => entry.quantity !== undefined);
  let priceEffectBrl: number | null = quoted ? null : 0;

  if (quoted && current.priceBrl !== null && baselinePrice !== null && hasMovementQuantities) {


    const operationEffect = recorded.quantityDelta * current.priceBrl
      - recorded.netFlowBrl - recorded.internalBrl - recorded.capitalizedIncomeBrl;
    priceEffectBrl = roundCents(base * (current.priceBrl - baselinePrice) + operationEffect);
  }

  const explained = recorded.netFlowBrl + recorded.internalBrl + recorded.capitalizedIncomeBrl + openingBrl + (priceEffectBrl ?? 0);
  return {
    source: current.source === "recorded" ? "recorded" : "mixed",
    fromMonth: previous?.month ?? current.month,
    acrossMissing,
    changeBrl,
    changePercent: Math.abs(start) < EPSILON ? null : (changeBrl / start) * 100,
    priceEffectBrl,
    flowBrl: recorded.netFlowBrl,
    pricePercent: previous?.priceBrl && current.priceBrl !== null ? (current.priceBrl / previous.priceBrl - 1) * 100 : null,
    incomeBrl: recorded.incomeBrl,
    capitalizedIncomeBrl: recorded.capitalizedIncomeBrl,
    internalBrl: recorded.internalBrl,
    openingBrl,
    unexplainedBrl: roundCents(changeBrl - explained),
  };
}

function mergeRecordedMonths(months: RecordedMonth[]): RecordedMonth {
  const merged = emptyRecordedMonth();
  for (const month of months) {
    for (const key of ["netFlowBrl", "contributionsBrl", "withdrawalsBrl", "incomeBrl", "capitalizedIncomeBrl", "openingBrl", "internalBrl", "quantityDelta", "openingQuantity", "count"] as const) {
      merged[key] += month[key];
    }
    merged.movements.push(...month.movements);
  }
  merged.movements.sort((left, right) => (left.occurredOn ?? "").localeCompare(right.occurredOn ?? ""));
  return merged;
}


export function summarizeHistory(slots: HistorySlot[], selectedMonth: string, quoted: boolean): PositionSummary {
  const selectedIndex = slots.findIndex(slot => slot.month === selectedMonth);
  const firstIndex = slots.findIndex(slot => slot.kind === "present");
  const empty: PositionSummary = { selectedMonth, state: firstIndex === -1 ? "never" : "before", firstMonth: null, lastPresentMonth: null, previousMonth: null, previousPresent: false, current: null, shareChange: null, monthStep: null, best: null, worst: null, averagePriceBrl: null, costBasisBrl: null };
  if (selectedIndex === -1 || firstIndex === -1) return empty;
  const previousIndex = findLastIndex(slots, selectedIndex - 1, slot => slot.kind !== "missing");
  const previous = previousIndex === -1 ? null : slots[previousIndex];
  if (firstIndex > selectedIndex) return { ...empty, previousMonth: previous?.month ?? null };
  const selected = slots[selectedIndex];
  const present = slots.slice(firstIndex, selectedIndex + 1).filter((slot): slot is PresentSlot => slot.kind === "present");
  const recorded = present.some(slot => slot.recorded !== null);
  const current = selected.kind === "present" ? selected : null;
  const steps = present.flatMap((slot, index) => slot.step && (recorded || index > 0) ? [{ ...slot.step, month: slot.month }] : []);
  const ranked = [...steps].sort((left, right) => metric(right, quoted) - metric(left, quoted));
  // Preserve the legacy average-price calculation; it is shared with the price chart.
  let cost = 0, costQuantity = 0;
  let initialized = false;
  let lastPresent: PresentSlot | null = null;
  if (!recorded) for (const slot of slots.slice(firstIndex, selectedIndex + 1)) {
    if (slot.kind === "absent") { if (slot.exitBrl !== null) { cost = 0; costQuantity = 0; } continue; }
    if (slot.kind !== "present") continue;
    if (!initialized || slot.entryBrl !== null) { initialized = true; cost = slot.valueBrl; costQuantity = slot.quantity; }
    else if (slot.step && lastPresent) {
      const delta = slot.quantity - costQuantity;
      if (delta > EPSILON && slot.priceBrl !== null) cost += delta * slot.priceBrl;
      else if (delta < -EPSILON && costQuantity > EPSILON) cost -= cost / costQuantity * -delta;
      costQuantity = slot.quantity;
    }
    lastPresent = slot;
  }
  const applied = current?.appliedBrl ?? null;
  const units = current?.appliedUnits ?? 0;
  return {
    selectedMonth, state: current ? "present" : "absent", firstMonth: slots[firstIndex].month,
    lastPresentMonth: present.at(-1)?.month ?? null, previousMonth: previous?.month ?? null,
    previousPresent: previous?.kind === "present", current,
    shareChange: current && previous?.kind === "present" ? current.share - previous.share : null,
    monthStep: current?.step ? { ...current.step, month: current.month } : null,
    best: ranked.length >= 2 ? ranked[0] : null, worst: ranked.length >= 2 ? ranked.at(-1)! : null,
    averagePriceBrl: recorded ? (quoted && applied !== null && units > QUANTITY_TOLERANCE ? applied / units : null) : quoted && current && costQuantity > EPSILON ? cost / costQuantity : null,
    costBasisBrl: quoted && current ? (recorded ? applied : roundCents(cost)) : null,
    costSource: !recorded ? "estimated" : current?.appliedFromOpening ? "opening" : "known",
    appliedBrl: applied, gainBrl: current?.gainBrl ?? null,
  };
}

function metric(step: HistoryStep, quoted: boolean) {
  if (step.source !== undefined && step.source !== "estimated") {
    return (step.priceEffectBrl ?? 0) + (step.incomeBrl ?? 0);
  }
  return quoted && step.priceEffectBrl !== null ? step.priceEffectBrl : step.changeBrl;
}

function findLastIndex<T>(items: T[], from: number, predicate: (item: T) => boolean) {
  for (let index = from; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
