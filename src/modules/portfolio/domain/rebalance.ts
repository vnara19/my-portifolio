
/** Compare current allocation with normalized targets and tolerance bands. Recommendations are projections, not recorded transactions. */
export type RebalanceDirection = "SELL" | "BUY" | "BALANCED";

export const DEFAULT_REBALANCE_TOLERANCE = 2;
export const MAX_REBALANCE_TOLERANCE = 20;

export const UNCLASSIFIED_LABEL = "Unclassified";
export const FIXED_INCOME_CLASS = "Renda Fixa";
export const VARIABLE_INCOME_CLASS = "Renda Variável";

export type AllocationGroupKey =
  | "ASSET_CLASS"
  | "CURRENCY"
  | "STRATEGY"
  | "CLASS_CURRENCY"
  | "FIXED_INCOME"
  | "VARIABLE_INCOME";

export type AllocationRow = {
  key: string;
  label: string;
  currentBrl: number;
  currentShare: number;
  targetShare: number | null;
  targetBrl: number | null;
  differenceShare: number | null;
  differenceBrl: number | null;
  direction: RebalanceDirection | null;
};

export type AllocationGroup = {
  key: AllocationGroupKey;
  title: string;
  description: string;
  rows: AllocationRow[];
};

type FlatTotal = { label: string; value: number };
type NestedTotal = { primary: string; secondary: string | null; value: number };

export type AllocationAggregates = {
  totalBrl: number;
  unclassifiedBrl: number;
  assetClass: FlatTotal[];
  currency: FlatTotal[];
  strategy: FlatTotal[];
  classCurrency: NestedTotal[];
  fixedIncome: NestedTotal[];
  variableIncome: NestedTotal[];
};

export type TargetValue = {
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  fraction: number;
};

export function buildAllocationGroups(
  aggregates: AllocationAggregates,
  targets: TargetValue[],
  tolerance: number,
): AllocationGroup[] {
  const { totalBrl } = aggregates;
  const classTotals = new Map(aggregates.assetClass.map((entry) => [entry.label, entry.value]));
  const classTargetBrl = new Map(
    targets
      .filter((target) => target.scope === "ASSET_CLASS")
      .map((target) => [target.primaryLabel, target.fraction * totalBrl]),
  );
  const parentTargetBrl = (label: string) => classTargetBrl.get(label) ?? 0;
  const parentTotal = (label: string) => classTotals.get(label) ?? 0;

  return [
    {
      key: "ASSET_CLASS",
      title: "Asset class",
      description: "Percentage of total portfolio value for the reporting month.",
      rows: buildFlatRows(aggregates.assetClass, totalBrl, targets, "ASSET_CLASS", tolerance, aggregates.unclassifiedBrl),
    },
    {
      key: "CURRENCY",
      title: "Overall currency",
      description: "Percentage of total portfolio value for the reporting month.",
      rows: buildFlatRows(aggregates.currency, totalBrl, targets, "CURRENCY", tolerance),
    },
    {
      key: "STRATEGY",
      title: "Strategy",
      description: "Percentage of total portfolio value for the reporting month.",
      rows: buildFlatRows(aggregates.strategy, totalBrl, targets, "STRATEGY", tolerance),
    },
    {
      key: "CLASS_CURRENCY",
      title: "Currency by class",
      description: "Percentage of the current total for each class.",
      rows: buildNestedRows(aggregates.classCurrency, targets, "CLASS_CURRENCY", tolerance, (primary) => ({
        denominator: parentTotal(primary),
        targetBase: parentTargetBrl(primary),
      })),
    },
    {
      key: "FIXED_INCOME",
      title: "Fixed income — subclass and term",
      description: `Percentage of the current total for ${FIXED_INCOME_CLASS}.`,
      rows: buildNestedRows(aggregates.fixedIncome, targets, "FIXED_INCOME", tolerance, () => ({
        denominator: parentTotal(FIXED_INCOME_CLASS),
        targetBase: parentTargetBrl(FIXED_INCOME_CLASS),
      })),
    },
    {
      key: "VARIABLE_INCOME",
      title: "Equities — subclass",
      description: `Percentage of the current total for ${VARIABLE_INCOME_CLASS}.`,
      rows: buildNestedRows(aggregates.variableIncome, targets, "VARIABLE_INCOME", tolerance, () => ({
        denominator: parentTotal(VARIABLE_INCOME_CLASS),
        targetBase: parentTargetBrl(VARIABLE_INCOME_CLASS),
      })),
    },
  ];
}

function buildFlatRows(
  totals: FlatTotal[],
  totalBrl: number,
  targets: TargetValue[],
  scope: AllocationGroupKey,
  tolerance: number,
  unclassifiedBrl?: number,
): AllocationRow[] {
  const targetByLabel = new Map(
    targets.filter((target) => target.scope === scope).map((target) => [target.primaryLabel, target.fraction]),
  );
  const rows = totals.map(({ label, value }) =>
    toRow(label, label, value, totalBrl, totalBrl, targetByLabel.get(label) ?? null, tolerance),
  );
  const present = new Set(totals.map((entry) => entry.label));


  for (const [label, fraction] of targetByLabel) {
    if (fraction > 0 && !present.has(label)) {
      rows.push(toRow(label, label, 0, totalBrl, totalBrl, fraction, tolerance));
    }
  }

  if (unclassifiedBrl !== undefined && unclassifiedBrl > 0) {
    rows.push(toRow(UNCLASSIFIED_LABEL, UNCLASSIFIED_LABEL, unclassifiedBrl, totalBrl, totalBrl, null, tolerance));
  }

  return rows.sort((left, right) => right.currentBrl - left.currentBrl);
}

function buildNestedRows(
  totals: NestedTotal[],
  targets: TargetValue[],
  scope: AllocationGroupKey,
  tolerance: number,
  bases: (primary: string) => { denominator: number; targetBase: number },
): AllocationRow[] {
  const scoped = targets.filter((target) => target.scope === scope);
  const withTargets: NestedTotal[] = [
    ...totals,

    ...scoped
      .filter(
        (target) =>
          target.fraction > 0 &&
          !totals.some((total) => total.primary === target.primaryLabel && total.secondary === target.secondaryLabel),
      )
      .map((target) => ({ primary: target.primaryLabel, secondary: target.secondaryLabel, value: 0 })),
  ];

  return withTargets
    .map(({ primary, secondary, value }) => {
      const target = scoped.find(
        (candidate) => candidate.primaryLabel === primary && candidate.secondaryLabel === secondary,
      );
      const { denominator, targetBase } = bases(primary);

      return toRow(
        `${primary}\u0000${secondary ?? ""}`,
        secondary !== null ? `${primary} · ${secondary}` : primary,
        value,
        denominator,
        targetBase,
        target?.fraction ?? null,
        tolerance,
      );
    })
    .sort((left, right) => right.currentBrl - left.currentBrl);
}

function toRow(
  key: string,
  label: string,
  currentBrl: number,
  denominatorBrl: number,
  targetBaseBrl: number,
  targetFraction: number | null,
  tolerance: number,
): AllocationRow {
  const currentShare = denominatorBrl === 0 ? 0 : (currentBrl / denominatorBrl) * 100;
  const targetShare = targetFraction === null ? null : targetFraction * 100;
  const targetBrl = targetFraction === null ? null : targetFraction * targetBaseBrl;
  const differenceShare = targetShare === null ? null : currentShare - targetShare;
  const differenceBrl = targetBrl === null ? null : currentBrl - targetBrl;

  return {
    key,
    label,
    currentBrl,
    currentShare,
    targetShare,
    targetBrl,
    differenceShare,
    differenceBrl,
    direction:
      differenceShare === null || differenceBrl === null
        ? null
        : Math.abs(differenceShare) <= tolerance
          ? "BALANCED"
          : differenceBrl > 0
            ? "SELL"
            : "BUY",
  };
}
