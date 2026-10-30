import { refreshBondsForUser } from "./international-bonds";
import { refreshFixedIncomeForUser } from "@/modules/portfolio/application/cdi-positions";
import { checkMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { getQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";
import { refreshUserQuotes } from "@/modules/quotes/application/refresh-user-quotes";


export async function runOpenChecks({ now = new Date() }: { now?: Date } = {}): Promise<OpenCheckResponse> {
  const rollover = await checkMonthsUpToDate(now).catch(
    (error: unknown): MonthRolloverOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Could not create the reporting month."),
    }),
  );

  const [quotesChanged, ...incomeChanges] = await Promise.all([
    refreshUserQuotes(now).catch(() => false),
    refreshFixedIncomeForUser(now).catch(() => false),
    refreshBondsForUser().catch(() => false),
  ]);
  return { quotesChanged, fixedIncomeChanged: incomeChanges.some(Boolean), rollover, targetPlan: "disabled", summary: await getQuoteRefreshSummary(now) };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
