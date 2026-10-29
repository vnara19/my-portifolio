
/** Investment navigation, reporting-month selection and the most recent successful quote update. */
import { ChartDonutIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { getSessionUser } from "@/modules/auth/session";
import { ProfileMenu } from "@/modules/auth/ui/profile-menu";
import { AppFrame } from "@/components/product/app-frame";
import { MainTabs, NavTrail, type NavContext, type TabKey } from "@/components/product/main-tabs";
import { MonthTimeline } from "@/components/product/month-timeline";
import { QuoteRefreshIndicator } from "@/components/product/quote-refresh-indicator";
import { cn } from "@/lib/utils";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import { getRequestQuoteRefreshSummary } from "@/modules/quotes/application/quote-refresh-summary";

type AppShellProps = {
  active: TabKey | "none";
  months: PortfolioMonthSummary[];
  selectedMonth: string | null;

  context?: NavContext;
  children: ReactNode;
};

export async function AppShell({ active, months, selectedMonth, context, children }: AppShellProps) {
  const user = await getSessionUser();
  return (
    <AppFrame
      area="investments"
      header={(menu) => (
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl">


          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            {menu ?? (
              <Link
                href="/"
                className={cn(
                  "inline-flex shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-[359px]:hidden lg:justify-self-start",
                  active === "settings" ? "max-[419px]:hidden" : null,
                )}
              >
                <span className="brand-mark grid size-9 place-items-center rounded-xl text-primary-foreground">
                  <ChartDonutIcon aria-hidden="true" size={18} weight="bold" />
                </span>
                <span className="hidden leading-none sm:block">
                  <span className="block text-[13px] font-semibold tracking-[-0.015em] text-foreground">My Portfolio
                  </span>
                  <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-primary/80 uppercase">
                    Private workspace
                  </span>
                </span>
              </Link>
            )}

            <div className="min-w-0 overflow-x-auto [scrollbar-width:none] lg:col-start-2 lg:row-start-1 lg:justify-self-center [&::-webkit-scrollbar]:hidden">
              <MainTabs active={active} />
            </div>

            <div className="flex shrink-0 items-center gap-2 lg:col-start-3 lg:row-start-1 lg:justify-self-end">

              <span className={cn("contents", menu ? "max-[359px]:hidden" : null)}>
                <Suspense fallback={<span role="status" className="flex h-9 items-center rounded-xl border border-border px-3 text-xs text-muted-foreground">Checking quotes…</span>}>
                  <QuoteStatus />
                </Suspense>
              </span>

              {user ? <ProfileMenu name={user.name} email={user.email} /> : null}
            </div>
          </div>

          {context ? <NavTrail context={context} /> : null}

          {selectedMonth ? (
            <MonthTimeline months={months} selectedMonth={selectedMonth} scoped={context?.kind === "position"} />
          ) : null}
        </header>
      )}
    >
      {children}
    </AppFrame>
  );
}

async function QuoteStatus() {
  return <QuoteRefreshIndicator summary={await getRequestQuoteRefreshSummary()} />;
}
