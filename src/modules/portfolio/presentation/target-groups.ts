import type { AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";

export const TARGET_SCOPES: { scope: AllocationGroupKey; title: string; description: string }[] = [
  { scope: "ASSET_CLASS", title: "Asset class", description: "Percentage of total portfolio value." },
  {
    scope: "CURRENCY",
    title: "Currency",
    description: "Percentage of total portfolio value, calculated using currency allocation within each class and each class target.",
  },
  { scope: "STRATEGY", title: "Strategy", description: "Percentage of total portfolio value." },
  { scope: "CLASS_CURRENCY", title: "Currency within each class", description: "Each class adds up to 100%." },
  { scope: "FIXED_INCOME", title: "Fixed income: subclass × redemption term", description: "Percentage of total fixed income." },
  { scope: "VARIABLE_INCOME", title: "Equities", description: "Percentage of total equities." },
];

export function targetGroupKey(scope: string, primaryLabel: string) {
  return scope === "CLASS_CURRENCY" ? `${scope}:${primaryLabel}` : scope;
}
