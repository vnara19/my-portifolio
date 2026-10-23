"use client";

import { useEffect, useState, useTransition } from "react";
import { Prisma } from "@/generated/prisma/browser";
import { addPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { BOND_FAMILIES, internationalBondSchema, bondName, fixedBondCouponSchema, purchaseBondInterest } from "../domain/international-bond";
import { bondReference } from "../domain/bond-reference";
import { Field, inputClass } from "./edit-dialogs";
import { formatCurrency, normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import type { PositionFormMonth } from "./position-form-dialog";
import type { NewAccountInput } from "../application/month-editing";

const structures = { Fixed: "Fixed Coupon", Zero: "Zero Coupon / Treasury Bills / STRIPS", Floating: "Floating Rate / FRNs", Inflation: "Inflation Linked / TIPS", Callable: "Callable / Putable / Convertible", Amortizing: "Amortizing / Securitized", Other: "Other / Structured" };
const emptyFields = () => ({ identifier: "", issuer: "", issuerCountry: "", family: "Corporate", currency: "USD", structure: "Fixed", quantity: "", faceValuePerBond: "", settlementDate: "", maturityDate: "", totalPaid: "", purchaseAccruedPerBond: "", annualRate: "", frequency: "", anchorDate: "", dayCount: "Manual" });
export function InternationalBondForm({ month, account, onSaved, formId, onPendingChange }: { month: PositionFormMonth; account: { accountId?: string; newAccount?: NewAccountInput } | null; onSaved: (result: EditActionResult) => void; formId: string; onPendingChange: (pending: boolean) => void }) {
  const [fields, setFields] = useState(emptyFields);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  const set = (key: keyof typeof fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  const number = (key: keyof typeof fields) => normalizeLocaleNumberInput(fields[key]) ?? fields[key];
  function lookup(value: string) {
    const identifier = value.trim().toUpperCase();
    const known = bondReference(identifier);
    if (known) setFields((previous) => ({ ...previous, identifier, issuer: known.issuer, issuerCountry: known.issuerCountry, family: known.family, currency: known.currency, maturityDate: known.maturityDate, faceValuePerBond: known.faceValuePerBond ?? previous.faceValuePerBond, structure: "Fixed", annualRate: known.fixedCoupon?.annualRate ?? "", frequency: known.fixedCoupon ? String(known.fixedCoupon.frequency) : "", anchorDate: known.fixedCoupon?.anchorDate ?? "", dayCount: known.fixedCoupon?.dayCount ?? "Manual" }));
  }
  const couponInput = fields.structure === "Fixed" && Boolean(fields.annualRate.trim() || fields.frequency || fields.anchorDate);
  const couponResult = couponInput ? fixedBondCouponSchema.safeParse({ annualRate: number("annualRate"), frequency: Number(fields.frequency), anchorDate: fields.anchorDate, dayCount: fields.dayCount, accrualStartDate: bondReference(fields.identifier)?.fixedCoupon?.accrualStartDate }) : null;
  const fixedCoupon = couponResult?.success ? couponResult.data : undefined;
  function amounts() {
    const quantity = number("quantity"), denomination = number("faceValuePerBond");
    if (!/^\d+(\.\d{1,8})?$/.test(quantity) || !/^\d+(\.\d{1,8})?$/.test(denomination)) throw new Error("Enter the quantity and face value per bond.");
    const faceAmount = new Prisma.Decimal(quantity).mul(denomination).toFixed();
    // A purchase date is not assumed to be a settlement date. Use the receipt interest.
    const accruedInterestPaid = fields.purchaseAccruedPerBond.trim() ? purchaseBondInterest(number("purchaseAccruedPerBond"), quantity) : fields.structure === "Zero" ? "0" : null;
    if (accruedInterestPaid === null) throw new Error("Enter accrued interest per bond from the purchase receipt; enter 0 only if none was paid.");
    return { faceAmount, accruedInterestPaid };

  }
  let calculated: ReturnType<typeof amounts> | null = null;
  try { calculated = amounts(); } catch { /* Incomplete input is validated on submit. */ }
  function submit() {
    if (pending) return;
    setError(null);
    try {
      if (!fields.maturityDate) throw new Error("Enter the maturity date.");
      if (couponInput && !fixedCoupon) throw new Error("Enter the coupon rate, frequency and a scheduled coupon date.");
      const computed = amounts();
      const parsed = internationalBondSchema.safeParse({ type: "international-bond", ...fields, ...computed, faceValuePerBond: number("faceValuePerBond"), totalPaid: number("totalPaid"), fixedCoupon, valuationMode: "Cost", quotes: [] });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review the bond details.");
      if (!account) throw new Error("Choose a portfolio account.");
      const bond = parsed.data;
      start(async () => {
        const result = await addPositionAction({ monthId: month.id, addition: { ...account, newAsset: { kind: "international-bond", name: bondName(bond), ticker: null, maturityDate: bond.maturityDate, quoteCheckToken: null, manualPriceBrl: null, bondContract: bond }, value: bond.faceAmount, allocations: [], strategy: null } });
        if (result.ok) onSaved(result); else setError(result.message);
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Review the bond details."); }
  }
  const text = (key: keyof typeof fields, label: string, placeholder: string, numeric = false) => <Field label={label}><input aria-label={label} className={inputClass} value={fields[key]} inputMode={numeric ? "decimal" : "text"} placeholder={placeholder} onChange={(e) => { if (key === "identifier") setFields({ ...emptyFields(), identifier: e.target.value }); else set(key, e.target.value); }} onBlur={key === "identifier" ? (e) => lookup(e.target.value) : undefined} maxLength={key === "identifier" ? 12 : 80} /></Field>;
  return <form id={formId} className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <h2 className="text-base font-semibold">Bond Details</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {text("identifier", "ISIN / CUSIP", "US172967KU42")}
      <Field label="Bond Type"><Picker aria-label="Bond type" searchable={false} options={Object.entries(BOND_FAMILIES).map(([value, label]) => ({ value, label }))} value={fields.family} onValueChange={(v) => set("family", v)} /></Field>
      {text("issuer", "Issuer", "Citigroup Inc.")}{text("issuerCountry", "Issuer Country", "United States")}
      <Field label="Bond Currency"><Picker aria-label="Bond currency" searchable={false} value={fields.currency} onValueChange={(v) => set("currency", v)} options={[{ value: "USD", label: "USD · US Dollar" }, { value: "EUR", label: "EUR · Euro" }]} /></Field>
      <Field label="Structure"><Picker aria-label="Bond structure" searchable={false} value={fields.structure} onValueChange={(v) => { setFields((p) => ({ ...p, structure: v, annualRate: "", frequency: "", anchorDate: "", dayCount: "Manual", purchaseAccruedPerBond: "" })); }} options={Object.entries(structures).map(([value, label]) => ({ value, label }))} /></Field>
      <Field label="Maturity Date"><DatePicker aria-label="Bond maturity date" value={fields.maturityDate} onChange={(v) => set("maturityDate", v)} /></Field>
      {text("faceValuePerBond", `Face Value per Bond (${fields.currency})`, "1000", true)}
    </div>
    {fields.structure === "Fixed" ? <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Regular Fixed Coupons</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("annualRate", "Annual Coupon Rate (%)", "4.125", true)}
        <Field label="Coupon Frequency"><Picker aria-label="Coupon frequency" value={fields.frequency} onValueChange={(v) => set("frequency", v)} searchable={false} options={[{ value: "1", label: "Annual" }, { value: "2", label: "Semi-annual" }, { value: "4", label: "Quarterly" }, { value: "12", label: "Monthly" }]} /></Field>
        <Field label="Next Scheduled Coupon Date"><DatePicker aria-label="Next scheduled coupon date" value={fields.anchorDate} onChange={(v) => set("anchorDate", v)} /></Field>
        {text("purchaseAccruedPerBond", `Purchase Accrued Interest per Bond (${fields.currency})`, "10.43", true)}
      </div>
    </div> : null}
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Your Purchase</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("quantity", "Quantity Purchased", "1.50", true)}
        <Field label="Purchase Date"><DatePicker aria-label="Purchase date" value={fields.settlementDate} onChange={(v) => set("settlementDate", v)} /></Field>
        {text("totalPaid", `Total Paid, Including Fees (${fields.currency})`, "992.31", true)}
        {fields.structure !== "Fixed" ? text("purchaseAccruedPerBond", `Purchase Accrued Interest per Bond (${fields.currency})`, fields.structure === "Zero" ? "0" : "10.43", true) : null}
      </div>
    </div>
    {calculated ? <dl className="grid grid-cols-1 gap-3 rounded-xl bg-muted/30 p-3 text-sm sm:grid-cols-2">
      {[["Nominal Amount Held", calculated.faceAmount], ["Purchase Accrued Interest", calculated.accruedInterestPaid]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{formatCurrency(Number(value), fields.currency as "USD" | "EUR")}</dd></div>)}
    </dl> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form>;
}
