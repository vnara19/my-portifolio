"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { addPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { BOND_FAMILIES, internationalBondSchema, bondName, type InternationalBond } from "@/modules/portfolio/domain/international-bond";
import { Field, inputClass } from "./edit-dialogs";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import type { PositionFormMonth } from "./position-form-dialog";
import type { NewAccountInput } from "../application/month-editing";

const structures = { Fixed: "Fixed Coupon", Zero: "Zero Coupon / Treasury Bills / STRIPS", Floating: "Floating Rate / FRNs", Inflation: "Inflation Linked / TIPS", Callable: "Callable / Putable / Convertible", Amortizing: "Amortizing / Securitized", Other: "Other / Structured" };
export function InternationalBondForm({ month, account, onSaved, onBack }: { month: PositionFormMonth; account: { accountId?: string; newAccount?: NewAccountInput } | null; onSaved: (result: EditActionResult) => void; onBack: () => void }) {
  const [fields, setFields] = useState({ identifier: "", issuer: "", issuerCountry: "", family: "Sovereign", currency: "USD", structure: "Fixed", faceAmount: "", settlementDate: "", maturityDate: "", totalPaid: "", accruedInterestPaid: "0", marketValue: "", quoteDate: "", source: "IBKR" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  function lookup(value: string) {
    const identifier = value.trim().toUpperCase();
    // Verified issuer/exchange references only. Unknown identifiers stay open for manual entry.
    const known = identifier === "US105756BK57" || identifier === "105756BK5" ? { issuer: "Federative Republic of Brazil", issuerCountry: "Brazil", currency: "USD", maturityDate: "2037-01-20" } : identifier === "IE00BV8C9B83" ? { issuer: "Ireland", issuerCountry: "Ireland", currency: "EUR", maturityDate: "2037-05-15" } : null;
    if (known) setFields((previous) => ({ ...previous, ...known, identifier, family: "Sovereign", structure: "Fixed" }));
  }
  const number = (key: "faceAmount" | "totalPaid" | "marketValue" | "accruedInterestPaid") => normalizeLocaleNumberInput(fields[key]) ?? fields[key];
  function submit() {
    setError(null);
    const parsed = internationalBondSchema.safeParse({ type: "international-bond", ...fields, faceAmount: number("faceAmount"), totalPaid: number("totalPaid"), accruedInterestPaid: number("accruedInterestPaid"), maturityDate: fields.maturityDate || null, quotes: [{ date: fields.quoteDate, marketValue: number("marketValue"), source: fields.source }] });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Review the bond details."); return; }
    if (!account) { setError("Choose a portfolio account."); return; }
    const bond: InternationalBond = parsed.data;
    start(async () => {
      const result = await addPositionAction({ monthId: month.id, addition: { ...account, newAsset: { kind: "international-bond", name: bondName(bond), ticker: null, maturityDate: bond.maturityDate, quoteCheckToken: null, manualPriceBrl: null, bondContract: bond }, value: bond.faceAmount, allocations: [], strategy: null } });
      if (result.ok) onSaved(result); else setError(result.message);
    });
  }
  const text = (key: keyof typeof fields, label: string, placeholder: string, numeric = false) => <Field label={label}><input aria-label={label} className={inputClass} value={fields[key]} inputMode={numeric ? "decimal" : "text"} placeholder={placeholder} onChange={(e) => { if (key === "identifier") setFields({ identifier: e.target.value, issuer: "", issuerCountry: "", family: "Sovereign", currency: "USD", structure: "Fixed", faceAmount: "", settlementDate: "", maturityDate: "", totalPaid: "", accruedInterestPaid: "0", marketValue: "", quoteDate: "", source: "IBKR" }); else set(key, e.target.value); }} onBlur={key === "identifier" ? (e) => lookup(e.target.value) : undefined} maxLength={key === "identifier" ? 12 : 80} /></Field>;
  return <>
    <header className="flex items-center justify-between border-b border-border p-5"><div><Dialog.Title className="font-semibold">International Bonds</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">{month.label} · Direct Holdings</Dialog.Description></div><Dialog.Close aria-label="Close" className="rounded-lg p-2">×</Dialog.Close></header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
      <Button variant="outline" onClick={onBack}>Change Asset Type</Button>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("identifier", "ISIN / CUSIP", "US105756BK57")}
        <Field label="Bond Type"><Picker aria-label="Bond type" searchable={false} options={Object.entries(BOND_FAMILIES).map(([value, label]) => ({ value, label }))} value={fields.family} onValueChange={(v) => set("family", v)} /></Field>
        {text("issuer", "Issuer", "US Treasury")}{text("issuerCountry", "Issuer Country", "United States")}
        <Field label="Bond Currency"><Picker aria-label="Bond currency" searchable={false} value={fields.currency} onValueChange={(v) => set("currency", v)} options={[{ value: "USD", label: "USD · US Dollar" }, { value: "EUR", label: "EUR · Euro" }]} /></Field>
        <Field label="Structure"><Picker aria-label="Bond structure" searchable={false} value={fields.structure} onValueChange={(v) => set("structure", v)} options={Object.entries(structures).map(([value, label]) => ({ value, label }))} /></Field>
        {text("faceAmount", `Face Amount Held (${fields.currency})`, "10000", true)}
        <Field label="Settlement Date"><DatePicker aria-label="Settlement date" value={fields.settlementDate} onChange={(v) => set("settlementDate", v)} /></Field>
        <Field label="Maturity Date (Optional)"><DatePicker aria-label="Bond maturity date" value={fields.maturityDate} onChange={(v) => set("maturityDate", v)} /></Field>
        {text("totalPaid", `Total Paid, Including Interest and Fees (${fields.currency})`, "9850.00", true)}
        {text("accruedInterestPaid", `Accrued Interest Included Above (${fields.currency})`, "0.00", true)}
        {text("marketValue", `Full Market Value, Including Accrued Interest (${fields.currency})`, "10150.00", true)}
        <Field label="Valuation Date"><DatePicker aria-label="Valuation date" value={fields.quoteDate} onChange={(v) => set("quoteDate", v)} /></Field>
        {text("source", "Price Source", "IBKR")}
      </div>
      <p className="text-xs text-muted-foreground">Manual Valuation · Full Holding Value · No Automatic Price Feed</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
    <footer className="flex justify-end gap-2 border-t border-border p-4"><Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close><Button disabled={pending} onClick={submit}>{pending ? "Saving…" : "Add Position"}</Button></footer>
  </>;
}
