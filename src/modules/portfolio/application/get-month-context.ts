import { refreshSavings } from "./savings";
import { applyMaturityExits } from "./maturity-exits";
import { ensureMonthsUpToDate } from "./month-rollover";
import {
  getPortfolioMonths,
  type PortfolioMonthSummary,
} from "@/modules/portfolio/application/get-portfolio-months";
import { resolveSelectedMonth } from "@/modules/portfolio/presentation/reference-month";

export type MonthContext = {
  months: PortfolioMonthSummary[];
  selected: PortfolioMonthSummary | null;
};

export async function getMonthContext(
  value: string | string[] | undefined,
): Promise<MonthContext> {
  await ensureMonthsUpToDate();
  await applyMaturityExits();
  await refreshSavings();
  const months = await getPortfolioMonths();

  return { months, selected: resolveSelectedMonth(months, value) as PortfolioMonthSummary | null };
}
