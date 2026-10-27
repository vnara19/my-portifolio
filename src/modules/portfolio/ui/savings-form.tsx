"use client";
import { useEffect, useState, useTransition } from "react";
import { createSavingsAction, changeSavingsAction } from "@/app/actions/savings";
import type { EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { savingsSchema, savingsAmount, readSavings, type Savings, type SavingsCalculation } from "../domain/savings";
import { FieldFeedbackProvider } from "./field-feedback";
import { Field, inputClass, primaryButtonClass } from "./edit-dialogs";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
const number = (v: string) => normalizeLocaleNumberInput(v) ?? v;
export function SavingsForm({ formId, onSaved, onPendingChange, onValidationChange }: {
    formId: string;
    onSaved: (r: EditActionResult) => void;
    onPendingChange: (p: boolean) => void;
    onValidationChange: (e: string[]) => void;
}) {
    const [name, setName] = useState("");
    const [currency, setCurrency] = useState<"BRL" | "USD" | "EUR">("BRL");
    const [product, setProduct] = useState<Savings["product"]>("CDI");
    const [opening, setOpening] = useState<Savings["openingType"] | null>(null);
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [gross, setGross] = useState("");
    const [net, setNet] = useState("");
    const [tier, setTier] = useState("");
    const [extra, setExtra] = useState("");
    const [tax, setTax] = useState("33");
    const [basis, setBasis] = useState<"PA" | "AER" | null>("AER");
    const [error, setError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const grossLabel = product === "CDI" ? "Percentage of CDI (%)" : product === "FLEXIBLE" ? "Gross APY (%)" : basis === "AER" ? "Gross AER (%)" : "Gross p.a. rate (%)";
    const terms = { kind: "SAVINGS" as const, currency, country: currency === "BRL" ? "Brazil" : "Ireland", product, startDate: date, openingType: opening, rates: [{ date, grossRate: number(gross), ...(product === "FLEXIBLE" ? { netRate: number(net) } : {}), ...(tier ? { tierLimit: number(tier), tierRate: number(extra) } : {}), ...(product === "INSTANT" ? { taxPercent: number(tax), ...(basis ? { quoteBasis: basis } : {}) } : {}) }], events: [{ id: "00000000-0000-4000-8000-000000000001", date, kind: "DEPOSIT" as const, amount: number(amount) }] };
    const validRate = (v: string) => /^\d+(\.\d{1,8})?$/.test(number(v)) && Number(number(v)) <= 1000;
    const fields = { "Starting amount type": { valid: Boolean(opening) }, ...(product === "INSTANT" ? { "Rate quotation": { valid: Boolean(basis) } } : {}), "Savings name": { valid: Boolean(name.trim()) }, "Starting amount": { valid: savingsAmount.safeParse(number(amount)).success }, [opening === "DEPOSIT" ? "Effective deposit date" : "Balance date"]: { valid: Boolean(date) && date <= new Date().toISOString().slice(0, 10) }, [grossLabel]: { valid: validRate(gross) }, ...(product === "FLEXIBLE" ? { "Final net APY": { valid: validRate(net) && Number(number(net)) <= Number(number(gross)) } } : {}), ...(tier ? { "Gross rate above the limit": { valid: validRate(extra) } } : {}) };
    const issues = Object.entries(fields).filter(([, field]) => !field.valid).map(([label]) => label);
    if (!issues.length && !readSavings(terms))
        issues.push("Review Savings terms");
    const key = issues.join("|");
    useEffect(() => onValidationChange(key ? key.split("|") : []), [key, onValidationChange]);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <FieldFeedbackProvider fields={fields}><form id={formId} className="space-y-4" onSubmit={e => { e.preventDefault(); if (issues.length)
        return; start(async () => { const checked = savingsSchema.parse({ ...terms, events: [{ ...terms.events[0], id: crypto.randomUUID() }] }); const result = await createSavingsAction({ name, amount: number(amount), terms: checked }); if (result.ok)
        onSaved(result);
    else
        setError(result.message); }); }}>
  <h2 className="text-base font-semibold">Savings</h2>
  <div className="grid gap-4 sm:grid-cols-2">
   <Field label="Savings name"><input aria-label="Savings name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="For example, Itaú Reserve or Revolut Savings"/></Field>
   <Field label="Currency"><Picker aria-label="Savings currency" value={currency} options={["BRL", "EUR", "USD"].map(v => ({ value: v, label: v }))} onValueChange={v => { setCurrency(v as typeof currency); setProduct(v === "BRL" ? "CDI" : v === "USD" ? "FLEXIBLE" : "INSTANT"); setGross(""); setNet(""); setTier(""); setExtra(""); }}/></Field>
   <Field label="Savings product"><Picker aria-label="Savings product" value={product} options={currency === "BRL" ? [{ value: "CDI", label: "Brazilian CDI Savings" }] : [...(currency === "EUR" ? [{ value: "INSTANT", label: "Instant Access Savings" }] : []), { value: "FLEXIBLE", label: "Flexible Cash Funds" }]} onValueChange={v => { setProduct(v as typeof product); setGross(""); setNet(""); setTier(""); setExtra(""); }}/></Field>
   <Field label="Starting amount type"><Picker aria-label="Starting amount type" value={opening} options={[{ value: "DEPOSIT", label: "Original Deposit" }, { value: "BALANCE", label: "Existing Balance" }]} onValueChange={v => setOpening(v as typeof opening)}/></Field>
   <Field label={`Starting amount (${currency})`}><input aria-label="Savings starting amount" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)}/></Field>
   <Field label={opening === "DEPOSIT" ? "Effective deposit date" : "Balance date"}><DatePicker aria-label="Savings start date" value={date} onChange={setDate} max={new Date().toISOString().slice(0, 10)}/></Field>
   <Field label={grossLabel}><input aria-label="Savings gross rate" inputMode="decimal" className={inputClass} value={gross} onChange={e => setGross(e.target.value)} placeholder={product === "CDI" ? "100" : "2.50"}/></Field>
   {product === "FLEXIBLE" ? <Field label="Final net APY (%)"><input aria-label="Savings net rate" inputMode="decimal" className={inputClass} value={net} onChange={e => setNet(e.target.value)} placeholder="After fees and withholding tax"/></Field> : null}
   {product === "INSTANT" ? <><Field label="Rate quotation"><Picker aria-label="Savings rate quotation" value={basis} options={[{ value: "PA", label: "p.a. · Nominal Annual Rate" }, { value: "AER", label: "AER · Effective Annual Rate" }]} onValueChange={v => setBasis(v as typeof basis)}/></Field><Field label="DIRT withheld (%)"><input aria-label="Savings withholding tax" inputMode="decimal" className={inputClass} value={tax} onChange={e => setTax(e.target.value)}/></Field><Field label="First-tier balance limit (EUR, optional)"><input aria-label="Savings tier limit" inputMode="decimal" className={inputClass} value={tier} onChange={e => setTier(e.target.value)} placeholder="2500"/></Field>{tier ? <Field label="Gross rate above the limit (%)"><input aria-label="Savings upper tier rate" inputMode="decimal" className={inputClass} value={extra} onChange={e => setExtra(e.target.value)} placeholder="1.00"/></Field> : null}</> : null}
  </div>
  <p className="text-xs leading-5 text-muted-foreground">{product === "CDI" ? (opening === "BALANCE" ? "Existing BRL net balances require manual balance updates until the original deposit history is known. No tax history is guessed." : "CDI accrues on Brazilian business days. Bank net value uses Brazilian resident CDB withholding rules. Each deposit keeps its original date.") : product === "INSTANT" ? "Ireland · daily interest on closing balance, with DIRT deducted before payment. Identify the rate quotation. The exact p.a. rate is in Deposit Information; converting a rounded AER may differ from the bank by cents." : "Ireland · use the final net rate after fees and withholding. Net-of-fees APY alone is not a final after-tax rate. Recorded rates remain in force until you update them."}</p>
  <p className="text-xs text-muted-foreground">Record deposits and withdrawals directly in Savings. Confirm the bank balance whenever you need to reconcile it.</p>
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
 <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); start(async () => { setError(null); const result = await changeSavingsAction({ assetId, date, kind, ...(kind === "RATE" ? { rate: { date, grossRate: number(gross), ...(terms.product === "FLEXIBLE" ? { netRate: number(net) } : {}), ...(tier ? { tierLimit: number(tier), tierRate: number(extra) } : {}), ...(terms.product === "INSTANT" ? { taxPercent: number(tax), quoteBasis: basis } : {}) } } : { amount: number(amount), ...(lot ? { lotId: lot } : {}) }) }); if (result.ok) {
        onSaved(result);
        setAmount("");
    }
    else
        setError(result.message); }); }}>
 <div className="grid gap-3 sm:grid-cols-2"><Field label="Action"><Picker aria-label="Savings action" value={kind} options={[{ value: "DEPOSIT", label: "Add Money" }, { value: "WITHDRAWAL", label: "Withdraw Money" }, { value: "RATE", label: "Update Rates" }, { value: "BALANCE", label: "Confirm Bank Balance" }]} onValueChange={v => setKind(v as typeof kind)}/></Field><Field label="Effective date"><DatePicker aria-label="Savings movement date" value={date} onChange={setDate} min={terms.startDate} max={new Date().toISOString().slice(0, 10)}/></Field>
 {kind === "RATE" ? <><Field label={terms.product === "CDI" ? "Percentage of CDI (%)" : terms.product === "FLEXIBLE" ? "Gross APY (%)" : basis === "AER" ? "Gross AER (%)" : "Gross p.a. rate (%)"}><input className={inputClass} value={gross} onChange={e => setGross(e.target.value)} inputMode="decimal"/></Field>{terms.product === "FLEXIBLE" ? <Field label="Final net APY (%)"><input className={inputClass} value={net} onChange={e => setNet(e.target.value)} inputMode="decimal"/></Field> : null}{terms.product === "INSTANT" ? <><Field label="Rate quotation"><Picker value={basis} options={[{ value: "PA", label: "p.a." }, { value: "AER", label: "AER" }]} onValueChange={v => setBasis(v as typeof basis)}/></Field><Field label="DIRT withheld (%)"><input className={inputClass} value={tax} onChange={e => setTax(e.target.value)}/></Field><Field label="First-tier limit (optional)"><input className={inputClass} value={tier} onChange={e => setTier(e.target.value)}/></Field>{tier ? <Field label="Gross rate above limit (%)"><input className={inputClass} value={extra} onChange={e => setExtra(e.target.value)}/></Field> : null}</> : null}</> : <Field label={`${kind === "BALANCE" ? "Bank balance" : "Amount"} (${terms.currency})`}><input aria-label="Savings movement amount" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"/></Field>}
 {kind === "WITHDRAWAL" && terms.product === "CDI" && state?.automatic && state.lots.filter(l => Number(l.net) > 0).length > 1 ? <Field label="Deposit being redeemed"><Picker aria-label="Savings deposit being redeemed" value={lot} options={state.lots.filter(l => Number(l.net) > 0).map(l => ({ value: l.id, label: `${l.date} · BRL ${l.net}` }))} onValueChange={setLot}/></Field> : null}</div>
 <p className="text-xs text-muted-foreground">Money enters or leaves this investment directly. A withdrawal is a capital outflow, not an investment loss. Rate updates apply from their effective date.</p>
 {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<button type="submit" disabled={pending} className={primaryButtonClass}>{pending ? "Saving…" : "Save Savings Update"}</button></form></section>;
}
