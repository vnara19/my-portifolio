import { checkMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";
import type { MonthRolloverOutcome, OpenCheckResponse, TargetPlanCheck } from "@/modules/portfolio/domain/month-rollover";
import { getQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";


export async function runOpenChecks({ now = new Date() }: { now?: Date } = {}): Promise<OpenCheckResponse> {
  const rollover = await checkMonthsUpToDate(now).catch(
    (error: unknown): MonthRolloverOutcome => ({
      state: "unavailable",
      message: describeUnexpected(error, "Could not create the reporting month."),
    }),
  );
  const targetPlan = await ensureDefaultTargetPlan().catch((): TargetPlanCheck => "unavailable");

  return { rollover, targetPlan, summary: await getQuoteRefreshSummary(now) };
}

function describeUnexpected(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} ${error.message.slice(0, 200)}` : fallback;
}
