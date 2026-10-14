import type { TargetValue } from "@/modules/portfolio/domain/rebalance";

export const STANDARD_DURATIONS = ["Curto", "Médio", "Longo"] as const;

type FixedIncomeTotal = { primary: string; secondary: string | null; value: number };

export type FixedIncomeDurationRow = {
  subclass: string;
  current: Record<string, number>;
  target: Record<string, number>;
};

export type FixedIncomeDuration = {
  durations: string[];
  rows: FixedIncomeDurationRow[];
  hasCurrent: boolean;
  hasTarget: boolean;
};

const collator = new Intl.Collator("en-GB");


export function buildFixedIncomeDuration(
  totals: FixedIncomeTotal[],
  targets: TargetValue[],
): FixedIncomeDuration {
  const current = totals.filter((entry) => entry.value > 0);
  const planned = targets.filter((target) => target.scope === "FIXED_INCOME" && target.fraction > 0);
  const currentTotal = current.reduce((sum, entry) => sum + entry.value, 0);

  const plannedSubclasses = unique(planned.map((target) => target.primaryLabel)).sort(collator.compare);
  const extraSubclasses = unique(current.map((entry) => entry.primary))
    .filter((subclass) => !plannedSubclasses.includes(subclass))
    .sort(collator.compare);
  const extraDurations = unique([
    ...current.map((entry) => durationOf(entry.secondary)),
    ...planned.map((target) => durationOf(target.secondaryLabel)),
  ])
    .filter((duration) => !(STANDARD_DURATIONS as readonly string[]).includes(duration))
    .sort(collator.compare);

  const rows = [...plannedSubclasses, ...extraSubclasses].map((subclass) => {
    const row: FixedIncomeDurationRow = { subclass, current: {}, target: {} };

    for (const entry of current.filter((candidate) => candidate.primary === subclass)) {
      const duration = durationOf(entry.secondary);
      row.current[duration] =
        (row.current[duration] ?? 0) + (currentTotal === 0 ? 0 : (entry.value / currentTotal) * 100);
    }

    for (const target of planned.filter((candidate) => candidate.primaryLabel === subclass)) {
      const duration = durationOf(target.secondaryLabel);
      row.target[duration] = (row.target[duration] ?? 0) + target.fraction * 100;
    }

    return row;
  });

  return {
    durations: [...STANDARD_DURATIONS, ...extraDurations],
    rows,
    hasCurrent: currentTotal > 0,
    hasTarget: planned.length > 0,
  };
}

function durationOf(label: string | null) {
  return label === null || label.trim() === "" ? "-" : label;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
