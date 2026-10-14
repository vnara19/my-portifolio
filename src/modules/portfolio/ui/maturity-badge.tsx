
import { englishLabel } from "@/lib/english-labels";
import { cn } from "@/lib/utils";
import { maturityStatus } from "@/modules/portfolio/presentation/maturity";


export function MaturityBadge({
  maturityDate,
  referenceDay,
  className,
  testId,
}: {
  maturityDate: string;
  referenceDay: string;
  className?: string;
  testId?: string;
}) {
  const status = maturityStatus(maturityDate, referenceDay);

  return (
    <span
      title={status.title}
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap",
        status.tone === "expired"
          ? "bg-destructive/12 font-semibold text-destructive"
          : status.tone === "soon"
            ? "bg-warning/50 font-semibold text-warning-foreground"
            : "bg-white/[0.04] text-muted-foreground",
        className,
      )}
    >
      {englishLabel(status.label)}
      <span className="sr-only">, {status.title.toLocaleLowerCase("en-GB")}</span>
    </span>
  );
}
