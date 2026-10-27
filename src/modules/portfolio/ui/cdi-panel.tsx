
import { englishLabel } from "@/lib/english-labels";
import { PercentIcon } from "@phosphor-icons/react/dist/ssr";

import type { CdiView } from "@/modules/portfolio/application/get-position-history";
import { ratesLabel } from "@/modules/portfolio/presentation/income-rate";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";

const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

function day(key: string) {
  return DAY.format(new Date(`${key}T00:00:00.000Z`));
}


export function CdiPanel({ cdi }: { cdi: CdiView }) {
  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="cdi-title" data-testid="cdi-panel">
      <div className="flex items-center gap-2">
        <PercentIcon aria-hidden="true" className="text-primary" size={16} weight="bold" />
        <h2 id="cdi-title" className="text-base font-semibold tracking-[-0.025em]">
          {ratesLabel(cdi.parts)}
        </h2>
      </div>

      {cdi.contract ? <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Item label="Product" value={cdi.contract.product} />
        <Item label="Issuer" value={cdi.contract.issuer} />
        <Item label="Interest basis" value={cdi.contract.basis === "CALENDAR_365" ? "365 calendar days" : "252 business days"} />
      </dl> : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item label="Month opening balance" value={formatBrl(cdi.baseBrl)} />
        <Item label="Gross Accrual" value={formatBrl(cdi.incomeBrl)} />
        <Item label={cdi.parts.some((part) => part.indexer === "IPCA") ? "Gross reference balance" : "Gross balance"} value={formatBrl(cdi.balanceBrl)} />
        <Item label="Accrued through" value={cdi.through ? day(cdi.through) : "—"} />
      </dl>

      {cdi.parts.some((part) => part.indexer === "IPCA") ? <div className="mt-2"><Item label="Published IPCA through" value={cdi.inflationThrough ? cdi.inflationThrough.split("-").reverse().join("/") : "Unavailable"} /></div> : null}
      {cdi.error ? (
        <p role="status" className="mt-3 text-[11px] text-warning-foreground">
          {cdi.error}
        </p>
      ) : null}

      {cdi.projection ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-2.5" data-testid="cdi-projection">
          <p className="text-xs text-foreground">Projection {cdi.projection.toMaturity ? "no vencimento" : "over 12 months"}, {day(cdi.projection.until)}:{" "}
            <span className="font-mono">{formatBrl(cdi.projection.balanceBrl)}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 px-3 py-2">
      <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(label)}</dt>
      <dd className="mt-0.5 font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}
