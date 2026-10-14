
/** Create equal-weight default targets from existing portfolio categories when no target plan exists. */
import {
  UNCLASSIFIED_LABEL,
  type AllocationAggregates,
  type AllocationGroupKey,
} from "@/modules/portfolio/domain/rebalance";




export const DEFAULT_TARGET_PLAN_NAME = "Default targets";

export type DefaultTarget = {
  key: string;
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  percent: number;
};

type Category = { primary: string; secondary: string | null; value: number };

export function buildDefaultTargets(aggregates: AllocationAggregates): DefaultTarget[] {
  const flat = (entries: { label: string; value: number }[]) =>
    entries
      .filter((entry) => entry.label !== UNCLASSIFIED_LABEL)
      .map((entry): Category => ({ primary: entry.label, secondary: null, value: entry.value }));

  const classCurrency = new Map<string, Category[]>();
  for (const entry of aggregates.classCurrency) {
    if (entry.secondary === null) {
      continue;
    }
    classCurrency.set(entry.primary, [
      ...(classCurrency.get(entry.primary) ?? []),
      { primary: entry.primary, secondary: entry.secondary, value: entry.value },
    ]);
  }

  const targets = [
    ...split("ASSET_CLASS", flat(aggregates.assetClass)),
    ...split("CURRENCY", flat(aggregates.currency)),
    ...split("STRATEGY", flat(aggregates.strategy)),

    ...[...classCurrency.values()].flatMap((entries) => split("CLASS_CURRENCY", entries)),
    ...split(
      "FIXED_INCOME",
      aggregates.fixedIncome.map((entry) => ({ primary: entry.primary, secondary: entry.secondary, value: entry.value })),
    ),
    ...split(
      "VARIABLE_INCOME",
      aggregates.variableIncome.map((entry) => ({ primary: entry.primary, secondary: null, value: entry.value })),
    ),
  ];


  const used = new Set<string>();
  return targets.map((target) => {
    let key = target.key;
    for (let suffix = 2; used.has(key); suffix += 1) {
      key = `${target.key}-${suffix}`;
    }
    used.add(key);
    return { ...target, key };
  });
}

function split(scope: AllocationGroupKey, categories: Category[]): DefaultTarget[] {
  if (categories.length === 0) {
    return [];
  }

  const ordered = [...categories].sort(
    (left, right) =>
      right.value - left.value ||
      left.primary.localeCompare(right.primary, "en-GB") ||
      (left.secondary ?? "").localeCompare(right.secondary ?? "", "en-GB"),
  );
  const base = Math.floor(100 / ordered.length);
  const remainder = 100 - base * ordered.length;

  return ordered.map((category, index) => ({
    key: targetKey(scope, category.primary, category.secondary),
    scope,
    primaryLabel: category.primary,
    secondaryLabel: category.secondary,
    percent: base + (index < remainder ? 1 : 0),
  }));
}


export function fixedIncomeTaxonomyTargets(subclasses: readonly string[], durations: readonly string[]) {
  return subclasses.flatMap((subclass) =>
    durations.map((duration) => ({
      key: targetKey("FIXED_INCOME", subclass, duration),
      scope: "FIXED_INCOME" as const,
      primaryLabel: subclass,
      secondaryLabel: duration,
    })),
  );
}


export function targetKey(scope: AllocationGroupKey, primaryLabel: string, secondaryLabel: string | null) {
  return [scope, normalizeTargetLabel(primaryLabel), secondaryLabel ? normalizeTargetLabel(secondaryLabel) : null]
    .filter(Boolean)
    .join(":");
}

function normalizeTargetLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
