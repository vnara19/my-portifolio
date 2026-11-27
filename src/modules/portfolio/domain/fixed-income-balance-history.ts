import { calculateIncomeMonth } from "./cdi-valuation";

type Input = Parameters<typeof calculateIncomeMonth>[0];

export function fixedIncomeBalanceHistory(input: Omit<Input, "onDailyBalance">, accruedThrough: string) {
  const balances = new Map<string, number>();
  // Stop accruing at the last recorded fixing, but still apply later dated movements.
  const afterAccrual = new Date(Date.parse(accruedThrough) + 86_400_000).toISOString().slice(0, 10);
  const result = calculateIncomeMonth({
    ...input,
    maturityDate: input.maturityDate && input.maturityDate < afterAccrual ? input.maturityDate : afterAccrual,
    onDailyBalance: (day, balance) => balances.set(day, balance),
  });
  return result.state === "calculated" ? balances : null;
}
