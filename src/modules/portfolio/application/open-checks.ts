import { refreshFixedIncomeForUser } from "@/modules/portfolio/application/cdi-positions";
import { checkMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { getQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";


export async function runOpenChecks({ now = new Date() }: { now?: Date } = {}): Promise<OpenCheckResponse> {
  const rollover = await checkMonthsUpToDate(now).catch(
    (error: unknown): MonthRolloverOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Could not create the reporting month."),
    }),
  );

  const fixedIncomeChanged = await refreshFixedIncomeForUser(now).catch(() => false);
  return { fixedIncomeChanged, rollover, targetPlan: "disabled", summary: await getQuoteRefreshSummary(now) };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
