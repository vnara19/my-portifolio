"use client";

import { useEffect, useState, useTransition } from "react";
import { addPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { BOND_FAMILIES, bondName, validBondIdentifier } from "../domain/international-bond";
import { bondReference } from "../domain/bond-reference";
import { applyBondLookup, type BondLookupResult } from "../domain/bond-lookup";
import { emptyBondFields, validateBondEntry, bondEntryLabels } from "../domain/bond-entry";
import { FieldFeedbackProvider } from "./field-feedback";
import { Field, inputClass } from "./edit-dialogs";
import { formatCurrency } from "../presentation/portfolio-format";
import type { PositionFormMonth } from "./position-form-dialog";
import type { NewAccountInput } from "../application/month-editing";

const structures = { Fixed: "Fixed Coupon", Zero: "Zero Coupon / Treasury Bills / STRIPS", Floating: "Floating Rate / FRNs", Inflation: "Inflation Linked / TIPS", Callable: "Callable / Putable / Convertible", Amortizing: "Amortizing / Securitized", Other: "Other / Structured" };
export function InternationalBondForm({ month, account, onSaved, formId, onPendingChange, onValidationChange }: { month: PositionFormMonth; account: { accountId?: string; newAccount?: NewAccountInput } | null; onSaved: (result: EditActionResult) => void; formId: string; onPendingChange: (pending: boolean) => void; onValidationChange: (issues: string[]) => void }) {
  const [model, setModel] = useState(() => ({ fields: emptyBondFields(), touched: new Set<string>() }));
  const fields = model.fields;
  const [latestPurchaseDay] = useState(() => { const reference = new Date(month.referenceDate); return new Date(Math.min(Date.now(), Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0))).toISOString().slice(0, 10); });
  const [automatic, setAutomatic] = useState<string[]>([]);
  const [lookupResult, setLookupResult] = useState<BondLookupResult | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  const updateField = (key: keyof typeof fields, value: string) => {
    setAutomatic((p) => p.filter((k) => k !== key));
    setModel((previous) => ({ fields: { ...previous.fields, [key]: value }, touched: new Set(previous.touched).add(key) }));
  };
  const identifier = fields.identifier.trim().toUpperCase();
  const referenceSource = lookupResult?.sources.find((source) => source.name === "Issuer reference") ?? lookupResult?.sources.find((source) => source.name !== "OpenFIGI");
  const displayName = fields.issuer || (lookupResult?.instrumentName?.replace(/\b[A-Z][A-Z]+\b/g, (word) => ["US", "USA", "UK", "NA", "PLC", "AG", "NV", "SA"].includes(word) ? word : word[0] + word.slice(1).toLowerCase()));
  useEffect(() => {
    if (!validBondIdentifier(identifier)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookupState("loading");
      try {
        const response = await fetch("/api/bonds/reference", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier }), signal: controller.signal });
        if (!response.ok) throw new Error("Lookup unavailable");
        const result: BondLookupResult = await response.json();
        if (controller.signal.aborted || result.identifier !== identifier) return;
        setModel((current) => {
          const next = applyBondLookup(current.fields, result, current.touched);
          return { ...current, fields: { ...next, dayCount: bondReference(identifier)?.fixedCoupon?.dayCount ?? "Manual" } };
        });
        setAutomatic(Object.keys(result.fields));
        setLookupResult(result); setLookupState("done");
      } catch { if (!controller.signal.aborted) setLookupState("error"); }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [identifier, attempt]);
  const validation = validateBondEntry(fields, latestPurchaseDay);
  const issueNames = Object.keys(validation.errors).map((key) => bondEntryLabels[key] ?? "Bond details");
  const issueKey = JSON.stringify(issueNames);
  useEffect(() => { onValidationChange(JSON.parse(issueKey)); }, [issueKey, onValidationChange]);
  const calculated = validation.calculated;
  const feedback = Object.fromEntries(validation.required.map((key) => [bondEntryLabels[key], { valid: !validation.errors[key], message: validation.errors[key], automatic: automatic.includes(key) && !model.touched.has(key) }]));
  function submit() {
    if (pending) return;
    setError(null);
    try {
      if (Object.keys(validation.errors).length) throw new Error("Complete the required bond details.");
      if (!validation.parsed.success) throw new Error("Review the bond details.");
      if (!account) throw new Error("Choose a portfolio account.");
      const bond = validation.parsed.data;
      start(async () => {
        const result = await addPositionAction({ monthId: month.id, addition: { ...account, newAsset: { kind: "international-bond", name: bondName(bond), ticker: null, maturityDate: bond.maturityDate, quoteCheckToken: null, manualPriceBrl: null, bondContract: bond }, value: bond.faceAmount, allocations: [], strategy: null } });
        if (result.ok) onSaved(result); else setError(result.message);
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Review the bond details."); }
  }
  const text = (key: keyof typeof fields, label: string, placeholder: string, numeric = false) => <Field label={label}><input aria-label={label} className={inputClass} value={fields[key]} inputMode={numeric ? "decimal" : "text"} placeholder={placeholder} onChange={(e) => { if (key === "identifier") { setAutomatic([]); setLookupResult(null); setLookupState("idle"); setModel({ fields: { ...emptyBondFields(), identifier: e.target.value }, touched: new Set() }); } else updateField(key, e.target.value); }} maxLength={key === "identifier" ? 12 : 80} /></Field>;
  return <FieldFeedbackProvider fields={feedback}><form noValidate id={formId} className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <h2 className="text-base font-semibold">Bond Details</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">{text("identifier", "ISIN / CUSIP", "US172967KU42")}
      <div className="text-[10px] leading-snug text-muted-foreground" role="status" aria-live="polite">
        {lookupState === "loading" ? "Looking up bond details…" : lookupState === "error" ? <>Lookup unavailable · enter the details manually. <button type="button" className="text-primary underline" onClick={() => setAttempt((p) => p + 1)}>Try again</button></> : lookupState === "done" ? <>
          {lookupResult?.sources.length ? <>{displayName || "Details found"}{referenceSource ? <> · <a className="text-primary underline underline-offset-2" href={referenceSource.url} target="_blank" rel="noreferrer">Issuer reference</a></> : null}</> : "No confirmed details found · enter manually."}
          {lookupResult?.conflicts.length ? " · Conflicting details left manual." : ""}
          {lookupResult?.unavailable.length ? " · Some sources unavailable." : ""}
        </> : null}
      </div></div>
      <Field label="Bond Type"><Picker aria-label="Bond type" searchable={false} options={Object.entries(BOND_FAMILIES).map(([value, label]) => ({ value, label }))} value={fields.family || null} onValueChange={(v) => updateField("family", v)} /></Field>
      {text("issuer", "Issuer", "Citigroup Inc.")}{text("issuerCountry", "Issuer Country", "United States")}
      <Field label="Bond Currency"><Picker aria-label="Bond currency" searchable={false} value={fields.currency || null} onValueChange={(v) => updateField("currency", v)} options={[{ value: "USD", label: "USD · US Dollar" }, { value: "EUR", label: "EUR · Euro" }]} /></Field>
      <Field label="Structure"><Picker aria-label="Bond structure" searchable={false} value={fields.structure || null} onValueChange={(v) => { updateField("structure", v); }} options={Object.entries(structures).map(([value, label]) => ({ value, label }))} /></Field>
      <Field label="Maturity Date"><DatePicker aria-label="Bond maturity date" value={fields.maturityDate} onChange={(v) => updateField("maturityDate", v)} /></Field>
      {text("faceValuePerBond", `Face Value per Bond (${fields.currency || "USD / EUR"})`, "1000", true)}
    </div>
    {fields.structure === "Fixed" ? <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Regular Fixed Coupons</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("annualRate", "Annual Coupon Rate (%)", "4.125", true)}
        <Field label="Coupon Frequency"><Picker aria-label="Coupon frequency" value={fields.frequency} onValueChange={(v) => updateField("frequency", v)} searchable={false} options={[{ value: "1", label: "Annual" }, { value: "2", label: "Semi-annual" }, { value: "4", label: "Quarterly" }, { value: "12", label: "Monthly" }]} /></Field>
        <Field label="Next Scheduled Coupon Date"><DatePicker aria-label="Next scheduled coupon date" value={fields.anchorDate} onChange={(v) => updateField("anchorDate", v)} /></Field>
        {text("purchaseAccruedPerBond", `Purchase Accrued Interest per Bond (${fields.currency || "USD / EUR"})`, "10.43", true)}
      </div>
    </div> : null}
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Your Purchase</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("quantity", "Quantity Purchased", "1.50", true)}
        <Field label="Purchase Date"><DatePicker aria-label="Purchase date" max={latestPurchaseDay} value={fields.settlementDate} onChange={(v) => updateField("settlementDate", v)} /></Field>
        {text("totalPaid", `Total Paid, Including Fees (${fields.currency || "USD / EUR"})`, "992.31", true)}
        {fields.structure !== "Fixed" ? text("purchaseAccruedPerBond", `Purchase Accrued Interest per Bond (${fields.currency || "USD / EUR"})`, fields.structure === "Zero" ? "0" : "10.43", true) : null}
      </div>
    </div>
    {calculated && fields.currency ? <dl className="grid grid-cols-1 gap-3 rounded-xl bg-muted/30 p-3 text-sm sm:grid-cols-2">
      {[["Nominal Amount Held", calculated.faceAmount], ["Purchase Accrued Interest", calculated.accruedInterestPaid]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{formatCurrency(Number(value), fields.currency as "USD" | "EUR")}</dd></div>)}
    </dl> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form></FieldFeedbackProvider>;
}
