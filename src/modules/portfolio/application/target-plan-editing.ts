
/** Validate target percentages per group and preserve target identities when saving an active plan. */
import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TARGETS_LOCK_KEY } from "@/lib/advisory-locks";
import { getUserDb, SCOPED_USER } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import { deriveCurrencyTargets } from "@/modules/portfolio/domain/currency-targets";
import { buildDefaultTargets, DEFAULT_TARGET_PLAN_NAME, fixedIncomeTaxonomyTargets } from "@/modules/portfolio/domain/default-targets";
import { DEFAULT_REBALANCE_TOLERANCE, MAX_REBALANCE_TOLERANCE } from "@/modules/portfolio/domain/rebalance";
import { targetGroupKey } from "@/modules/portfolio/presentation/target-groups";
import { REDEMPTIONS_BY_CLASS, SUBCLASSES_BY_CLASS } from "@/modules/portfolio/domain/classification";

export class TargetPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetPlanError";
  }
}

const SUM_TOLERANCE = new Prisma.Decimal("0.0001");

export async function saveTargetPlan(input: { targets: { key: string; percent: string }[]; tolerance: string }) {
  const prisma = await getUserDb();

  if (!prisma) {
    throw new TargetPlanError("The database is unavailable.");
  }

  const active = await prisma.targetPlan.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tolerancePercent: true,
      targets: {
        select: { key: true, scope: true, primaryLabel: true, secondaryLabel: true, percentage: true },
      },
    },
  });

  if (!active) {
    throw new TargetPlanError("There is no active target plan to edit.");
  }

  const submitted = new Map(input.targets.map((entry) => [entry.key, entry.percent]));


  const existingKeys = new Set(active.targets.map((target) => target.key));
  const added = fixedIncomeTaxonomyTargets(SUBCLASSES_BY_CLASS["Renda Fixa"], REDEMPTIONS_BY_CLASS["Renda Fixa"])
    .filter((target) => !existingKeys.has(target.key) && submitted.has(target.key))
    .map((target) => ({ ...target, percentage: new Prisma.Decimal(0) }));
  const planTargets = [...active.targets, ...added];

  if (submitted.size !== input.targets.length || submitted.size !== planTargets.length) {
    throw new TargetPlanError("The submitted targets do not match the plan categories.");
  }

  const submittedTargets = planTargets.map((target) => {
    const raw = submitted.get(target.key);

    if (raw === undefined) {
      throw new TargetPlanError("The submitted targets do not match the plan categories.");
    }

    const percent = parsePercent(raw);
    return { ...target, fraction: percent.div(100) };
  });


  const derived = deriveCurrencyTargets(
    submittedTargets.map((target) => ({ ...target, fraction: target.fraction.toNumber() })),
  );
  const parsed = submittedTargets.map((target) =>
    target.scope === "CURRENCY"
      ? { ...target, fraction: new Prisma.Decimal(derived.get(target.primaryLabel) ?? 0).toDecimalPlaces(10) }
      : target,
  );

  const sums = new Map<string, Prisma.Decimal>();
  for (const target of parsed) {

    if (target.scope === "CURRENCY") {
      continue;
    }
    const group = targetGroupKey(target.scope, target.primaryLabel);
    sums.set(group, (sums.get(group) ?? new Prisma.Decimal(0)).plus(target.fraction));
  }

  const invalid = [...sums.entries()].filter(([, total]) => total.minus(1).abs().greaterThan(SUM_TOLERANCE));
  if (invalid.length > 0) {
    throw new TargetPlanError(
      `${invalid.length === 1 ? "One group does not add up to" : `${invalid.length} groups do not add up to`} 100%. Adjust before saving.`,
    );
  }

  const tolerance = parseTolerance(input.tolerance);
  const changed = parsed.filter((target) => !target.fraction.equals(target.percentage));

  if (changed.length === 0 && tolerance.equals(active.tolerancePercent)) {
    throw new TargetPlanError("No targets changed.");
  }


  return prisma.$transaction(async (transaction) => {
    const addedKeys = new Set(added.map((target) => target.key));

    if (added.length > 0) {
      await transaction.allocationTarget.createMany({
        data: parsed
          .filter((target) => addedKeys.has(target.key))
          .map((target) => ({
            userId: SCOPED_USER,
            planId: active.id,
            key: target.key,
            scope: target.scope,
            primaryLabel: target.primaryLabel,
            secondaryLabel: target.secondaryLabel,
            percentage: target.fraction,
          })),
      });
    }

    for (const target of changed.filter((entry) => !addedKeys.has(entry.key))) {
      await transaction.allocationTarget.updateMany({
        where: { planId: active.id, key: target.key },
        data: { percentage: target.fraction },
      });
    }

    return transaction.targetPlan.update({
      where: { id: active.id },
      data: { tolerancePercent: tolerance },
      select: { id: true, name: true },
    });
  });
}

export type DefaultTargetPlanOutcome = "created" | "existing" | "no-positions";


export async function ensureDefaultTargetPlan(): Promise<DefaultTargetPlanOutcome> {
  const prisma = await getUserDb();

  if (!prisma) {
    throw new TargetPlanError("The database is unavailable.");
  }

  if (await prisma.targetPlan.findFirst({ where: { isActive: true }, select: { id: true } })) {
    return "existing";
  }

  const overview = await getAllocationOverview();
  const targets = overview ? buildDefaultTargets(overview.aggregates) : [];

  if (targets.length === 0) {
    return "no-positions";
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${DEFAULT_TARGETS_LOCK_KEY})`;

    if (await transaction.targetPlan.findFirst({ where: { isActive: true }, select: { id: true } })) {
      return "existing";
    }

    const plan = await transaction.targetPlan.create({
      data: { userId: SCOPED_USER, name: DEFAULT_TARGET_PLAN_NAME, isActive: true, tolerancePercent: DEFAULT_REBALANCE_TOLERANCE },
      select: { id: true },
    });

    await transaction.allocationTarget.createMany({
      data: targets.map((target) => ({
        userId: SCOPED_USER,
        planId: plan.id,
        key: target.key,
        scope: target.scope,
        primaryLabel: target.primaryLabel,
        secondaryLabel: target.secondaryLabel,
        percentage: new Prisma.Decimal(target.percent).div(100),
      })),
    });

    return "created";
  });
}

function parseTolerance(raw: string) {
  const value = parseDecimal(raw);

  if (value === null || value.greaterThan(MAX_REBALANCE_TOLERANCE) || value.decimalPlaces() > 2) {
    throw new TargetPlanError(
      `Use a tolerance between 0 and ${MAX_REBALANCE_TOLERANCE} points, with at most two decimal places.`,
    );
  }

  return value;
}

function parsePercent(raw: string) {
  const value = parseDecimal(raw);

  if (value === null) {
    throw new TargetPlanError("Use only numeric percentages between 0 and 100.");
  }

  if (value.greaterThan(100) || value.decimalPlaces() > 8) {
    throw new TargetPlanError("Use percentages between 0 and 100, with at most eight decimal places.");
  }

  return value;
}

function parseDecimal(raw: string) {
  const trimmed = raw.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  return /^\d+(?:\.\d+)?$/.test(normalized) ? new Prisma.Decimal(normalized) : null;
}
