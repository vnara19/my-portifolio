"use client";
import { useEffect, useState, useTransition } from "react";
import { createSavingsAction, changeSavingsAction } from "@/app/actions/savings";
import type { EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { EURO_SAVINGS_RATE, savingsSchema, savingsAmount, readSavings, type Savings, type SavingsCalculation } from "../domain/savings";
import { FieldFeedbackProvider } from "./field-feedback";
import { Field, inputClass, primaryButtonClass } from "./edit-dialogs";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
const number = (v: string) => normalizeLocaleNumberInput(v) ?? v;
function EuroSavingsConditions({ rate = EURO_SAVINGS_RATE }: { rate?: Omit<Savings["rates"][number], "date"> }) {
    const money = (value: string) => `€${Number(value).toLocaleString("en-GB")}`;
    const quotation = rate.quoteBasis === "PA" ? "p.a." : "AER";
    return <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm" aria-label="Instant Access Savings conditions">
        <p className="font-medium">Instant Access Savings</p>
        <dl className="mt-3 space-y-2 text-muted-foreground">
            <div className="flex flex-wrap justify-between gap-x-4"><dt>{rate.tierLimit ? `On the first ${money(rate.tierLimit)}` : "Gross annual rate"}</dt><dd>{rate.grossRate}% {quotation} gross</dd></div>
            {rate.tierLimit ? <div className="flex flex-wrap justify-between gap-x-4"><dt>On the amount above {money(rate.tierLimit)}</dt><dd>{rate.tierRate}% {quotation} gross</dd></div> : null}
            <div className="flex flex-wrap justify-between gap-x-4"><dt>Tax on Interest</dt><dd>{rate.taxPercent ?? "33"}%</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Daily interest, including weekends. Tax is deducted from interest.</p>
    </div>;
}
export function SavingsForm({ formId, onSaved, onPendingChange, onValidationChange }: {
    formId: string; onSaved: (r: EditActionResult) => void;
    onPendingChange: (p: boolean) => void; onValidationChange: (e: string[]) => void;
}) {
    const [name, setName] = useState("");
    const [currency, setCurrency] = useState<"BRL" | "EUR">("BRL");
    const [opening, setOpening] = useState<Savings["openingType"] | null>(null);
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [gross, setGross] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const euro = currency === "EUR";
    const dateLabel = !euro && opening === "DEPOSIT" ? "Deposit Date" : "Starting Date";
    const terms = { kind: "SAVINGS" as const, currency, country: euro ? "Ireland" : "Brazil",
        product: euro ? "INSTANT" : "CDI", startDate: date, openingType: euro ? "BALANCE" : opening,
        rates: [{ date, ...(euro ? EURO_SAVINGS_RATE : { grossRate: number(gross) }) }],
        events: [{ id: "00000000-0000-4000-8000-000000000001", date, kind: "DEPOSIT" as const, amount: number(amount) }] };
    const fields = { "Savings name": { valid: Boolean(name.trim()) && name.trim().length <= 80 },
        "Starting amount": { valid: savingsAmount.safeParse(number(amount)).success },
        [dateLabel]: { valid: Boolean(date) && date <= new Date().toISOString().slice(0, 10) },
        ...(!euro ? { "Starting amount type": { valid: Boolean(opening) }, "Percentage of CDI": { valid: /^\d+(\.\d{1,8})?$/.test(number(gross)) && Number(number(gross)) <= 1000 } } : {}) };
    const issues = Object.entries(fields).filter(([, field]) => !field.valid).map(([label]) => label);
    if (!issues.length && !readSavings(terms)) issues.push("Review Savings terms");
    const key = issues.join("|");
    useEffect(() => onValidationChange(key ? key.split("|") : []), [key, onValidationChange]);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <FieldFeedbackProvider fields={fields}><form id={formId} className="space-y-4" onSubmit={e => {
        e.preventDefault(); if (issues.length) return;
        start(async () => {
            const checked = savingsSchema.parse({ ...terms, events: [{ ...terms.events[0], id: crypto.randomUUID() }] });
            const result = await createSavingsAction({ name, amount: number(amount), terms: checked });
            if (result.ok) onSaved(result); else setError(result.message);
        });
    }}>
        <h2 className="text-base font-semibold">Savings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Savings name"><input aria-label="Savings name" maxLength={80} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="For example, Itaú Reserve or Revolut Savings" /></Field>
            <Field label="Currency"><Picker aria-label="Savings currency" value={currency} options={["BRL", "EUR"].map(value => ({ value, label: value }))} onValueChange={v => { setCurrency(v as typeof currency); setError(null); }} /></Field>
        </div>
        {euro ? <EuroSavingsConditions /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
            {!euro ? <Field label="Starting amount type"><Picker aria-label="Starting amount type" value={opening} options={[{ value: "DEPOSIT", label: "New Deposit" }, { value: "BALANCE", label: "Existing Balance" }]} onValueChange={v => setOpening(v as typeof opening)} /></Field> : null}
            <Field label={`Starting amount (${currency})`}><input aria-label="Savings starting amount" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} /></Field>
            <Field label={dateLabel}><DatePicker aria-label="Savings start date" value={date} onChange={setDate} max={new Date().toISOString().slice(0, 10)} /></Field>
            {!euro ? <Field label="Percentage of CDI (%)"><input aria-label="Savings gross rate" inputMode="decimal" className={inputClass} value={gross} onChange={e => setGross(e.target.value)} placeholder="100" /></Field> : null}
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form></FieldFeedbackProvider>;
}
export function SavingsManager({ assetId, terms, state, onSaved }: {
    assetId: string;
    terms: Savings;
    state: SavingsCalculation | null;
    onSaved: (r: EditActionResult) => void;
}) {
    const [kind, setKind] = useState<"DEPOSIT" | "WITHDRAWAL" | "BALANCE" | "RATE">("DEPOSIT");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [amount, setAmount] = useState("");
    const [lot, setLot] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const [current] = useState(() => [...terms.rates].sort((a, b) => b.date.localeCompare(a.date))[0]);
    const [gross, setGross] = useState(current.grossRate);
    const [net, setNet] = useState(current.netRate ?? "");
    const [tier, setTier] = useState(current.tierLimit ?? "");
    const [extra, setExtra] = useState(current.tierRate ?? "");
    const [tax, setTax] = useState(current.taxPercent ?? "33");
    const [basis, setBasis] = useState<"PA" | "AER">(current.quoteBasis ?? "PA");
    return <section id="savings-manager" className="premium-panel mt-6 scroll-mt-40 rounded-2xl p-5" data-testid="savings-manager"><h2 className="text-base font-semibold">Savings · {terms.currency}</h2>{state ? <p className="mt-3 font-mono text-xl">{terms.currency} {Number(state.balance).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p> : null}<p className="mt-2 text-xs text-muted-foreground">{terms.product === "CDI" ? "Brazilian CDI Savings" : terms.product === "INSTANT" ? "Instant Access Savings" : "Flexible Cash Funds"} · {terms.country} · {state?.automatic ? "Calculated at recorded rates" : "Manual balance"}</p>
 {terms.product === "INSTANT" ? <div className="mt-4"><EuroSavingsConditions rate={current} /></div> : null}
 <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); start(async () => { setError(null); const result = await changeSavingsAction({ assetId, date, kind, ...(kind === "RATE" ? { rate: { date, grossRate: number(gross), ...(terms.product === "FLEXIBLE" ? { netRate: number(net) } : {}), ...(tier ? { tierLimit: number(tier), tierRate: number(extra) } : {}), ...(terms.product === "INSTANT" ? { taxPercent: number(tax), quoteBasis: basis } : {}) } } : { amount: number(amount), ...(lot ? { lotId: lot } : {}) }) }); if (result.ok) {
        onSaved(result);
        setAmount("");
    }
    else
        setError(result.message); }); }}>
 <div className="grid gap-3 sm:grid-cols-2"><Field label="Action"><Picker aria-label="Savings action" value={kind} options={[{ value: "DEPOSIT", label: "Add Money" }, { value: "WITHDRAWAL", label: "Withdraw Money" }, ...(terms.product === "INSTANT" ? [] : [{ value: "RATE", label: "Update Rates" }]), { value: "BALANCE", label: "Confirm Bank Balance" }]} onValueChange={v => setKind(v as typeof kind)}/></Field><Field label="Effective date"><DatePicker aria-label="Savings movement date" value={date} onChange={setDate} min={terms.startDate} max={new Date().toISOString().slice(0, 10)}/></Field>
 {kind === "RATE" ? <><Field label={terms.product === "CDI" ? "Percentage of CDI (%)" : terms.product === "FLEXIBLE" ? "Gross APY (%)" : basis === "AER" ? "Gross AER (%)" : "Gross p.a. rate (%)"}><input className={inputClass} value={gross} onChange={e => setGross(e.target.value)} inputMode="decimal"/></Field>{terms.product === "FLEXIBLE" ? <Field label="Final net APY (%)"><input className={inputClass} value={net} onChange={e => setNet(e.target.value)} inputMode="decimal"/></Field> : null}{terms.product === "INSTANT" ? <><Field label="Rate quotation"><Picker value={basis} options={[{ value: "PA", label: "p.a." }, { value: "AER", label: "AER" }]} onValueChange={v => setBasis(v as typeof basis)}/></Field><Field label="DIRT withheld (%)"><input className={inputClass} value={tax} onChange={e => setTax(e.target.value)}/></Field><Field label="First-tier limit (optional)"><input className={inputClass} value={tier} onChange={e => setTier(e.target.value)}/></Field>{tier ? <Field label="Gross rate above limit (%)"><input className={inputClass} value={extra} onChange={e => setExtra(e.target.value)}/></Field> : null}</> : null}</> : <Field label={`${kind === "BALANCE" ? "Bank balance" : "Amount"} (${terms.currency})`}><input aria-label="Savings movement amount" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"/></Field>}
 {kind === "WITHDRAWAL" && terms.product === "CDI" && state?.automatic && state.lots.filter(l => Number(l.net) > 0).length > 1 ? <Field label="Deposit being redeemed"><Picker aria-label="Savings deposit being redeemed" value={lot} options={state.lots.filter(l => Number(l.net) > 0).map(l => ({ value: l.id, label: `${l.date} · BRL ${l.net}` }))} onValueChange={setLot}/></Field> : null}</div>
 <p className="text-xs text-muted-foreground">Money enters or leaves this investment directly. A withdrawal is a capital outflow, not an investment loss. Rate updates apply from their effective date.</p>
 {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<button type="submit" disabled={pending} className={primaryButtonClass}>{pending ? "Saving…" : "Save Savings Update"}</button></form></section>;
}
