"use client";

import { useEffect, useState, useTransition } from "react";
import { Prisma } from "@/generated/prisma/browser";
import { addPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { BOND_FAMILIES, internationalBondSchema, bondName, fixedBondCouponSchema, fixedBondAccrued, bondPriceToHoldingValue, bondDay, validBondIdentifier } from "../domain/international-bond";
import { bondReference } from "../domain/bond-reference";
import { Field, inputClass } from "./edit-dialogs";
import { formatCurrency, normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import type { PositionFormMonth } from "./position-form-dialog";
import type { NewAccountInput } from "../application/month-editing";

const structures = { Fixed: "Fixed Coupon", Zero: "Zero Coupon / Treasury Bills / STRIPS", Floating: "Floating Rate / FRNs", Inflation: "Inflation Linked / TIPS", Callable: "Callable / Putable / Convertible", Amortizing: "Amortizing / Securitized", Other: "Other / Structured" };
const emptyFields = () => ({ identifier: "", issuer: "", issuerCountry: "", family: "", currency: "", structure: "", quantity: "", faceValuePerBond: "", settlementDate: "", maturityDate: "", totalPaid: "", accruedInterestPaid: "", price: "", quoteDate: "", priceBasis: "PerBond", priceType: "Dirty", quoteAccrued: "", annualRate: "", frequency: "", anchorDate: "", dayCount: "Manual" });
export function InternationalBondForm({ month, account, onSaved, formId, onPendingChange }: { month: PositionFormMonth; account: { accountId?: string; newAccount?: NewAccountInput } | null; onSaved: (result: EditActionResult) => void; formId: string; onPendingChange: (pending: boolean) => void }) {
  const [fields, setFields] = useState(emptyFields);
  const [identifierChecked, setIdentifierChecked] = useState(false);
  const [showPriceOptions, setShowPriceOptions] = useState(false);
  const [adjustInterest, setAdjustInterest] = useState(false);
  const reference = identifierChecked ? bondReference(fields.identifier) : null;
  const identified = identifierChecked && validBondIdentifier(fields.identifier.trim().toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  const set = (key: keyof typeof fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  const number = (key: keyof typeof fields) => normalizeLocaleNumberInput(fields[key]) ?? fields[key];
  function lookup(value: string) {
    const identifier = value.trim().toUpperCase();
    setIdentifierChecked(true);
    if (!validBondIdentifier(identifier)) { setError("Enter a valid ISIN or CUSIP."); return; }
    setError(null);
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
    const autoInterest = fixedCoupon?.dayCount === "30/360 US" && bondDay.safeParse(fields.settlementDate).success && bondDay.safeParse(fields.maturityDate).success ? fixedBondAccrued(fixedCoupon, fields.settlementDate, faceAmount, fields.maturityDate).toFixed() : fields.structure === "Zero" ? "0" : null;
    const accruedInterestPaid = fields.accruedInterestPaid.trim() ? number("accruedInterestPaid") : autoInterest;
    if (accruedInterestPaid === null) throw new Error("Enter purchase accrued interest from the receipt; enter 0 only if none was paid.");
    let quoteAccrued = "0";
    if (fields.priceType === "Clean") {
      if (fixedCoupon?.dayCount === "30/360 US" && bondDay.safeParse(fields.quoteDate).success) quoteAccrued = fixedBondAccrued(fixedCoupon, fields.quoteDate, faceAmount, fields.maturityDate).toFixed();
      else if (fields.structure !== "Zero") {
        if (!fields.quoteAccrued.trim()) throw new Error("Enter accrued interest per bond for the clean price.");
        quoteAccrued = new Prisma.Decimal(number("quoteAccrued")).mul(quantity).toFixed();
      }
    }
    const marketValue = bondPriceToHoldingValue({ price: number("price"), quantity, faceValuePerBond: denomination, priceBasis: fields.priceBasis as "PerBond" | "Percent", priceType: fields.priceType as "Clean" | "Dirty", accruedInterest: quoteAccrued });
    return { faceAmount, accruedInterestPaid, marketValue, autoInterest };
  }
  let calculated: ReturnType<typeof amounts> | null = null;
  try { calculated = amounts(); } catch { /* Incomplete input is validated on submit. */ }
  function submit() {
    if (pending) return;
    setError(null);
    try {
      if (!identified) throw new Error("Enter a valid ISIN or CUSIP first.");
      if (!fields.family || !fields.currency || !fields.structure) throw new Error("Choose the bond type, currency and structure.");
      if (!fields.maturityDate) throw new Error("Enter the maturity date.");
      if (fields.structure === "Fixed" && !fixedCoupon) throw new Error("Enter the coupon rate, frequency and a scheduled coupon date.");
      const computed = amounts();
      const parsed = internationalBondSchema.safeParse({ type: "international-bond", ...fields, ...computed, faceValuePerBond: number("faceValuePerBond"), totalPaid: number("totalPaid"), fixedCoupon, quotes: [{ date: fields.quoteDate, marketValue: computed.marketValue, source: `User Price · ${fields.priceType} · ${fields.priceBasis === "Percent" ? "% of Face" : "Per Bond"}` }] });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review the bond details.");
      if (!account) throw new Error("Choose a portfolio account.");
      const bond = parsed.data;
      start(async () => {
        const result = await addPositionAction({ monthId: month.id, addition: { ...account, newAsset: { kind: "international-bond", name: bondName(bond), ticker: null, maturityDate: bond.maturityDate, quoteCheckToken: null, manualPriceBrl: null, bondContract: bond }, value: bond.faceAmount, allocations: [], strategy: null } });
        if (result.ok) onSaved(result); else setError(result.message);
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Review the bond details."); }
  }
  const text = (key: keyof typeof fields, label: string, placeholder: string, numeric = false) => <Field label={label}><input aria-label={label} className={inputClass} value={fields[key]} inputMode={numeric ? "decimal" : "text"} placeholder={placeholder} onChange={(e) => { if (key === "identifier") { setFields({ ...emptyFields(), identifier: e.target.value }); setIdentifierChecked(false); setShowPriceOptions(false); setAdjustInterest(false); setError(null); } else set(key, e.target.value); }} onBlur={key === "identifier" ? (e) => lookup(e.target.value) : undefined} maxLength={key === "identifier" ? 12 : 80} /></Field>;
  const autoAccrual = fixedCoupon?.dayCount === "30/360 US" || fields.structure === "Zero";
  return <form id={formId} className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <h2 className="text-base font-semibold">Bond Details</h2>
    {text("identifier", "ISIN / CUSIP", "US172967KU42")}
    {identified ? <>
    <p role="status" className="text-xs font-medium text-muted-foreground">{reference ? "Saved Reference Details" : "Enter Bond Details"}</p>
    {reference ? <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3">
      {[["Issuer", reference.issuer], ["Country", reference.issuerCountry], ["Currency", reference.currency], ["Maturity", reference.maturityDate], ...(reference.faceValuePerBond ? [["Face Value per Bond", reference.faceValuePerBond]] : []), ...(reference.fixedCoupon ? [["Annual Coupon", `${reference.fixedCoupon.annualRate}%`], ["Payments", { 1: "Annual", 2: "Semi-annual", 4: "Quarterly", 12: "Monthly" }[reference.fixedCoupon.frequency]]] : [])].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
    </dl> : null}
    {!reference ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {text("issuer", "Issuer", "Issuer Name")}{text("issuerCountry", "Issuer Country", "Country Name")}
      <Field label="Bond Type"><Picker aria-label="Bond type" searchable={false} options={Object.entries(BOND_FAMILIES).map(([value, label]) => ({ value, label }))} value={fields.family} onValueChange={(v) => set("family", v)} /></Field>
      <Field label="Bond Currency"><Picker aria-label="Bond currency" searchable={false} value={fields.currency} onValueChange={(v) => set("currency", v)} options={[{ value: "USD", label: "USD · US Dollar" }, { value: "EUR", label: "EUR · Euro" }]} /></Field>
      <Field label="Structure"><Picker aria-label="Bond structure" searchable={false} value={fields.structure} onValueChange={(v) => { setFields((p) => ({ ...p, structure: v, annualRate: "", frequency: "", anchorDate: "", dayCount: "Manual", accruedInterestPaid: "" })); }} options={Object.entries(structures).map(([value, label]) => ({ value, label }))} /></Field>
      <Field label="Maturity Date"><DatePicker aria-label="Bond maturity date" value={fields.maturityDate} onChange={(v) => set("maturityDate", v)} /></Field>
    </div> : null}
    {!reference?.faceValuePerBond ? text("faceValuePerBond", `Face Value per Bond (${fields.currency || "Currency"})`, "1000", true) : null}
    {fields.structure === "Fixed" && !reference?.fixedCoupon ? <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Regular Fixed Coupons</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("annualRate", "Annual Coupon Rate (%)", "4.125", true)}
        <Field label="Coupon Frequency"><Picker aria-label="Coupon frequency" value={fields.frequency} onValueChange={(v) => set("frequency", v)} searchable={false} options={[{ value: "1", label: "Annual" }, { value: "2", label: "Semi-annual" }, { value: "4", label: "Quarterly" }, { value: "12", label: "Monthly" }]} /></Field>
        <Field label="Next Scheduled Coupon Date"><DatePicker aria-label="Next scheduled coupon date" value={fields.anchorDate} onChange={(v) => set("anchorDate", v)} /></Field>
      </div>
    </div> : null}
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Your Purchase</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("quantity", "Quantity Purchased", "1.50", true)}
        <Field label="Purchase Settlement Date"><DatePicker aria-label="Purchase settlement date" value={fields.settlementDate} onChange={(v) => set("settlementDate", v)} /></Field>
        {text("totalPaid", `Total Paid, Including Fees (${fields.currency || "Currency"})`, "992.31", true)}
        {!autoAccrual || adjustInterest ? text("accruedInterestPaid", `Purchase Accrued Interest (${fields.currency || "Currency"})`, "10.43", true) : null}
      </div>
    </div>
    <div className="space-y-3 border-t border-border pt-4">
      {autoAccrual ? <button type="button" className="text-xs text-primary underline underline-offset-4" onClick={() => { setAdjustInterest(!adjustInterest); set("accruedInterestPaid", ""); }}>{adjustInterest ? "Use Calculated Purchase Interest" : "Adjust Interest from Receipt"}</button> : null}
      <h3 className="text-sm font-semibold">Current Price</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showPriceOptions ? <Field label="Price Format"><Picker aria-label="Bond price format" value={fields.priceBasis} onValueChange={(v) => set("priceBasis", v)} searchable={false} options={[{ value: "PerBond", label: `Amount per Bond (${fields.currency})` }, { value: "Percent", label: "Percentage of Face Value" }]} /></Field> : null}
        {showPriceOptions ? <Field label="Price Type"><Picker aria-label="Bond price type" value={fields.priceType} onValueChange={(v) => set("priceType", v)} searchable={false} options={[{ value: "Dirty", label: "Dirty Price · Includes Interest" }, { value: "Clean", label: "Clean Price · Excludes Interest" }]} /></Field> : null}
        {text("price", fields.priceBasis === "Percent" ? `Price ${fields.priceType === "Dirty" ? "Including" : "Excluding"} Interest (%)` : `Price per Bond, ${fields.priceType === "Dirty" ? "Including" : "Excluding"} Interest (${fields.currency || "Currency"})`, fields.priceBasis === "Percent" ? "99.231" : "992.31", true)}
        <Field label="Price Date"><DatePicker aria-label="Bond price date" value={fields.quoteDate} onChange={(v) => set("quoteDate", v)} /></Field>
        {fields.priceType === "Clean" && !autoAccrual ? text("quoteAccrued", `Current Accrued Interest per Bond (${fields.currency})`, "10.43", true) : null}
      </div>
    </div>
    <button type="button" className="text-xs text-primary underline underline-offset-4" onClick={() => { setShowPriceOptions(!showPriceOptions); setFields((previous) => ({ ...previous, price: "", priceBasis: "PerBond", priceType: "Dirty", quoteAccrued: "" })); }}>{showPriceOptions ? "Use Price Including Interest per Bond" : "Use Another Price Format"}</button>
    {calculated && (fields.currency === "USD" || fields.currency === "EUR") ? <dl className="grid grid-cols-1 gap-3 rounded-xl bg-muted/30 p-3 text-sm sm:grid-cols-3">
      {[["Nominal Amount Held", calculated.faceAmount], ["Purchase Accrued Interest", calculated.accruedInterestPaid], ["Current Position Value", calculated.marketValue]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{formatCurrency(Number(value), fields.currency as "USD" | "EUR")}</dd></div>)}
    </dl> : null}
    </> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form>;
}
