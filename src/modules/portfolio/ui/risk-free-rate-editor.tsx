"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { saveRiskFreeRateAction } from "@/app/actions/risk-free-rate";
import { Button } from "@/components/ui/button";
import { setPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
const MAX_RISK_FREE_RATE = 100;
import { parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";
import { StepSlider } from "@/modules/portfolio/ui/step-slider";

const format = (value: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2, useGrouping: false }).format(value);

/** The annual risk-free reference is independent of legacy allocation tolerance. */
export function RiskFreeRateEditor({ rate, children }: { rate: number; children?: ReactNode }) {
  const [saved, setSaved] = useState(rate);
  const [draft, setDraft] = useState(format(rate));
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const value = parseLocaleNumber(draft);
  const invalid = value === null || value < 0 || value > MAX_RISK_FREE_RATE || Math.abs(Math.round(value * 100) - value * 100) > 1e-6;
  const changed = value !== saved;
  useEffect(() => {
    setPendingChanges(changed ? 1 : 0);
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  useEffect(() => () => setPendingChanges(0), []);
  const save = () => startSaving(async () => {
    const result = await saveRiskFreeRateAction(draft);
    setMessage(result);
    if (result.ok && value !== null) { setSaved(value); setDraft(format(value)); }
  });
  return <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-7">
    <header className="border-b border-border/70 pb-4">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Settings</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Portfolio Settings</h1>
    </header>
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-6" aria-label="Risk-Free Rate">
      <h2 className="text-base font-semibold tracking-[-0.025em]">Risk-Free Rate</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Annual reference rate used for Sharpe Ratio and Sortino Ratio. Changing it does not change your gains.</p>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3">
        <StepSlider value={invalid ? saved : value!} max={MAX_RISK_FREE_RATE} largeStep={5} label="Risk-Free Rate band"
          valueText={(current) => `${format(current)} percent per year`} onChange={(next) => setDraft(format(next))} />
        <span className="relative flex items-center">
          <input inputMode="decimal" value={draft} aria-label="Risk-Free Rate in percent per year" aria-invalid={invalid}
            onChange={(event) => { setDraft(event.target.value); setMessage(null); }} onFocus={(event) => event.currentTarget.select()}
            className={cn("h-8 w-full rounded-lg border bg-background/60 pr-7 pl-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50", invalid ? "border-destructive" : "border-border")} />
          <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">%</span>
        </span>
      </div>
      {invalid ? <p role="alert" className="mt-3 text-xs text-destructive">Use 0–{MAX_RISK_FREE_RATE} percent per year, with at most two decimal places.</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-10" disabled={!changed || isSaving} onClick={() => { setDraft(format(saved)); setMessage(null); }}>Discard</Button>
        <Button type="button" className="min-h-10" disabled={!changed || invalid || isSaving} onClick={save}>{isSaving ? "Saving…" : "Save Risk-Free Rate"}</Button>
      </div>
      {message ? <p role={message.ok ? "status" : "alert"} className={cn("mt-3 text-sm", message.ok ? "text-primary" : "text-destructive")}>{message.message}</p> : null}
    </section>
    <div className="mt-6 space-y-6">{children}</div>
  </div>;
}
