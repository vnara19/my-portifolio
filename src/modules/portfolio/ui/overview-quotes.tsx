import { BankIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import { describeSelic, formatSelic } from "@/modules/quotes/presentation/selic-format";

export function OverviewQuotes({ overview, selic }: { overview: OverviewData; selic: SelicMonthView | null }) {
  return (
      <div className="metric-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <QuoteBadge icon={<BankIcon aria-hidden="true" size={16} weight="duotone" />} label="Selic Rate"
            value={formatSelic(selic)} detail={describeSelic(selic)} testId="selic-month" />
          <QuoteBadge label="Positions" value={overview.positionCount.toLocaleString("en-GB")} />
        </div>
      </div>
  );
}

function QuoteBadge({ icon, label, value, detail, testId }: { icon?: ReactNode; label: string; value: string; detail?: string; testId?: string }) {
  return <div className="flex items-center gap-2.5" title={detail} data-testid={testId}>
    {icon ? <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">{icon}</span> : null}
    <div>
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
      {detail ? <span className="sr-only">{detail}</span> : null}
    </div>
  </div>;
}
