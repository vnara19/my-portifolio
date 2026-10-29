import { assetTypeOf } from "../domain/classification";
import { exposureCurrency } from "../presentation/position-display";
import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { withDerivedCurrency } from "@/modules/portfolio/domain/currency-targets";
import {
  buildAllocationGroups,
  DEFAULT_REBALANCE_TOLERANCE,
  FIXED_INCOME_CLASS,
  UNCLASSIFIED_LABEL,
  VARIABLE_INCOME_CLASS,
  type AllocationAggregates,
  type AllocationGroup,
  type AllocationGroupKey,
  type TargetValue,
} from "@/modules/portfolio/domain/rebalance";

export type AllocationOverview = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  totalBrl: number;
  hasTargetPlan: boolean;
  unclassifiedBrl: number;
  unclassifiedShare: number;
  aggregates: AllocationAggregates;
  targets: TargetValue[];
  tolerance: number;
  groups: AllocationGroup[];
};

type PositionForAllocation = {
  totalBrl: Prisma.Decimal;
  strategy: string | null;
  asset: { baseCurrency: string; assetType?: string | null };
  allocations: { assetClass: string; subclass: string; duration: string; weight: Prisma.Decimal }[];
};

export async function getAllocationOverview(
  referenceDate?: Date,
): Promise<AllocationOverview | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  try {
    const [month, { targets, tolerance }] = await Promise.all([
      prisma.portfolioMonth.findFirst({
        where: referenceDate ? { referenceDate } : undefined,
        orderBy: { referenceDate: "desc" },
        select: {
          referenceDate: true,
          status: true,

          positions: {
            where: { quantity: { gt: 0 } },
            select: {
              totalBrl: true,
              strategy: true,
              asset: { select: { baseCurrency: true, assetType: true } },
              allocations: {
                select: { assetClass: true, subclass: true, duration: true, weight: true },
              },
            },
          },
        },
      }),
      getActivePlan(),
    ]);

    if (!month || month.positions.length === 0) {
      return null;
    }

    const aggregates = aggregatePositions(month.positions);

    return {
      referenceDate: month.referenceDate,
      monthStatus: month.status,
      totalBrl: aggregates.totalBrl,
      hasTargetPlan: targets.length > 0,
      unclassifiedBrl: aggregates.unclassifiedBrl,
      unclassifiedShare:
        aggregates.totalBrl === 0 ? 0 : (aggregates.unclassifiedBrl / aggregates.totalBrl) * 100,
      aggregates,
      targets,
      tolerance,
      groups: buildAllocationGroups(aggregates, targets, tolerance),
    };
  } catch {
    return null;
  }
}

export async function getActivePlan(): Promise<{ targets: TargetValue[]; tolerance: number }> {
  const prisma = await getUserDb();

  if (!prisma) {
    return { targets: [], tolerance: DEFAULT_REBALANCE_TOLERANCE };
  }

  const plan = await prisma.targetPlan.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      tolerancePercent: true,
      targets: {
        select: { scope: true, primaryLabel: true, secondaryLabel: true, percentage: true },
      },
    },
  });


  return {
    targets: withDerivedCurrency(
      (plan?.targets ?? []).map((target) => ({
        scope: target.scope as AllocationGroupKey,
        primaryLabel: target.primaryLabel,
        secondaryLabel: target.secondaryLabel,
        fraction: target.percentage.toNumber(),
      })),
    ).map((target): TargetValue => ({ ...target, scope: target.scope as AllocationGroupKey })),
    tolerance: plan?.tolerancePercent.toNumber() ?? DEFAULT_REBALANCE_TOLERANCE,
  };
}

function aggregatePositions(positions: PositionForAllocation[]): AllocationAggregates {
  let total = new Prisma.Decimal(0);
  let unclassified = new Prisma.Decimal(0);
  const assetClass = new Map<string, Prisma.Decimal>();
  const currency = new Map<string, Prisma.Decimal>();
  const strategy = new Map<string, Prisma.Decimal>();
  const classCurrency = new Map<string, { primary: string; secondary: string; value: Prisma.Decimal }>();
  const fixedIncome = new Map<string, { primary: string; secondary: string; value: Prisma.Decimal }>();
  const variableIncome = new Map<string, { primary: string; secondary: null; value: Prisma.Decimal }>();

  const add = (map: Map<string, Prisma.Decimal>, label: string, value: Prisma.Decimal) =>
    map.set(label, (map.get(label) ?? new Prisma.Decimal(0)).plus(value));

  for (const position of positions) {
    total = total.plus(position.totalBrl);
    const reportingCurrency = exposureCurrency(assetTypeOf({ ...position.asset, assetType: position.asset.assetType ?? null, name: "", quoteSymbol: null }), position.asset.baseCurrency);
    add(currency, reportingCurrency, position.totalBrl);
    add(strategy, position.strategy ?? UNCLASSIFIED_LABEL, position.totalBrl);

    if (position.allocations.length === 0) {
      unclassified = unclassified.plus(position.totalBrl);
      continue;
    }

    for (const saved of position.allocations) {
      const allocation = saved.subclass === "Stablecoin" ? { ...saved, assetClass: "Cripto" } : saved;
      const contribution = position.totalBrl.mul(allocation.weight);
      add(assetClass, allocation.assetClass, contribution);

      const currencyKey = JSON.stringify([allocation.assetClass, reportingCurrency]);
      const currentCurrency = classCurrency.get(currencyKey);
      classCurrency.set(currencyKey, {
        primary: allocation.assetClass,
        secondary: reportingCurrency,
        value: (currentCurrency?.value ?? new Prisma.Decimal(0)).plus(contribution),
      });

      if (allocation.assetClass === FIXED_INCOME_CLASS) {
        const key = JSON.stringify([allocation.subclass, allocation.duration]);
        const current = fixedIncome.get(key);
        fixedIncome.set(key, {
          primary: allocation.subclass,
          secondary: allocation.duration,
          value: (current?.value ?? new Prisma.Decimal(0)).plus(contribution),
        });
      }

      if (allocation.assetClass === VARIABLE_INCOME_CLASS) {
        const current = variableIncome.get(allocation.subclass);
        variableIncome.set(allocation.subclass, {
          primary: allocation.subclass,
          secondary: null,
          value: (current?.value ?? new Prisma.Decimal(0)).plus(contribution),
        });
      }
    }
  }

  const flat = (map: Map<string, Prisma.Decimal>) =>
    [...map.entries()].map(([label, value]) => ({ label, value: value.toNumber() }));
  const nested = <T extends { value: Prisma.Decimal }>(map: Map<string, T>) =>
    [...map.values()].map((entry) => ({ ...entry, value: entry.value.toNumber() }));

  return {
    totalBrl: total.toNumber(),
    unclassifiedBrl: unclassified.toNumber(),
    assetClass: flat(assetClass),
    currency: flat(currency),
    strategy: flat(strategy),
    classCurrency: nested(classCurrency),
    fixedIncome: nested(fixedIncome),
    variableIncome: nested(variableIncome),
  };
}
