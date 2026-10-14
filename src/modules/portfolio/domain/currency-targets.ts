import type { AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";


type TargetFraction = {
  scope: AllocationGroupKey | string;
  primaryLabel: string;
  secondaryLabel: string | null;

  fraction: number;
};


export function deriveCurrencyTargets(targets: TargetFraction[]) {
  const classes = new Map<string, number>();

  for (const target of targets) {
    if (target.scope === "ASSET_CLASS") {
      classes.set(target.primaryLabel, (classes.get(target.primaryLabel) ?? 0) + target.fraction);
    }
  }

  const currencies = new Map<string, number>();

  for (const target of targets) {
    if (target.scope !== "CLASS_CURRENCY" || target.secondaryLabel === null) {
      continue;
    }

    currencies.set(
      target.secondaryLabel,
      (currencies.get(target.secondaryLabel) ?? 0) + (classes.get(target.primaryLabel) ?? 0) * target.fraction,
    );
  }


  for (const target of targets) {
    if (target.scope === "CURRENCY" && !currencies.has(target.primaryLabel)) {
      currencies.set(target.primaryLabel, 0);
    }
  }

  return currencies;
}


export function withDerivedCurrency<T extends TargetFraction>(targets: T[]): TargetFraction[] {
  const derived = deriveCurrencyTargets(targets);

  return [
    ...targets.filter((target) => target.scope !== "CURRENCY"),
    ...[...derived].map(([currency, fraction]) => ({
      scope: "CURRENCY" as const,
      primaryLabel: currency,
      secondaryLabel: null,
      fraction,
    })),
  ];
}
