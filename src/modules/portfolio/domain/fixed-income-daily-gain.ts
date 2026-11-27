import { Prisma } from "@/generated/prisma/client";
import { calculateIncomeMonth } from "./cdi-valuation";

type AccrualInput = Parameters<typeof calculateIncomeMonth>[0];

export function fixedIncomeDailyGain(
  input: Omit<AccrualInput, "asOf" | "openingBalance">,
  accruedThrough: string,
  evaluationDay: string,
  recordedBalance: number,
) {
  const unavailable = { amount: null, percent: null };
  if (accruedThrough > evaluationDay || accruedThrough < input.startDate || recordedBalance <= 0) return unavailable;

  const nextDay = new Date(Date.parse(accruedThrough) + 86_400_000).toISOString().slice(0, 10);
  const before = calculateIncomeMonth({
    ...input, openingBalance: "0", asOf: accruedThrough,
    movements: input.movements.filter(movement => movement.date <= accruedThrough),
  });
  const after = calculateIncomeMonth({
    ...input, openingBalance: "0", asOf: nextDay,
    movements: input.movements.filter(movement => movement.date <= accruedThrough),
  });
  const atEvaluation = calculateIncomeMonth({
    ...input, openingBalance: "0", asOf: nextDay,
    movements: input.movements.filter(movement => movement.date <= evaluationDay),
  });
  if (before.state !== "calculated" || after.state !== "calculated" || atEvaluation.state !== "calculated" ||
      after.lastRateDate !== accruedThrough || !new Prisma.Decimal(atEvaluation.balance).eq(recordedBalance)) return unavailable;

  const gain = new Prisma.Decimal(after.income).minus(before.income);
  const base = new Prisma.Decimal(before.balance);
  return base.gt(0) ? { amount: gain.toNumber(), percent: gain.div(base).mul(100).toNumber() } : unavailable;
}
