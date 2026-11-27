import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { getMonthQuotes } from "@/modules/quotes/application/get-month-quotes";
import { getRunHistory } from "@/modules/quotes/application/get-run-history";
import { getRequestQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";
import { QuotesWorkspace } from "@/modules/quotes/ui/quotes-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quotes",
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const [month, summary, history] = await Promise.all([
    getMonthQuotes(selected?.referenceDate),
    getRequestQuoteRefreshSummary(),
    selected ? getRunHistory(selected.referenceDate) : Promise.resolve(null),
  ]);

  return (
    <AppShell
      active="positions"
      months={months}
      selectedMonth={selected?.month ?? null}
      context={{ kind: "quotes", label: selected ? `Quotes · ${formatMonthCompact(selected.referenceDate)}` : "Quotes" }}
    >
      <QuotesWorkspace month={month} summary={summary} history={history} automaticUpdates={process.env.VERCEL_ENV === "production"} />
    </AppShell>
  );
}
