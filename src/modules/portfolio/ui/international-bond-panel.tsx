"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoChangeAction } from "@/app/actions/edit-month";
import { updateBondAction } from "@/app/actions/international-bonds";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { type InternationalBond, BOND_FAMILIES, scheduledBondCoupons, fixedBondAccrued, bondPriceToHoldingValue } from "../domain/international-bond";
import { Prisma } from "@/generated/prisma/browser";
import { Picker } from "@/components/ui/picker";
import { formatCurrency, normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import { Field, inputClass } from "./edit-dialogs";
export function InternationalBondPanel({ bond, asOf, monthId, positionId, faceHeld }: { bond: InternationalBond; asOf: string; monthId: string | null; positionId: string | null; faceHeld: number }) {
  const quote = bond.quotes.filter((q) => q.date <= asOf).sort((a, b) => b.date.localeCompare(a.date))[0];
  const [value, setValue] = useState(""); const [date, setDate] = useState(""); const [coupon, setCoupon] = useState("");
  const [priceType, setPriceType] = useState("Dirty"); const [quoteAccrued, setQuoteAccrued] = useState("");
  const [priceBasis, setPriceBasis] = useState("PerBond");
  const [redeemed, setRedeemed] = useState(""); const [principal, setPrincipal] = useState("");
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [pending, start] = useTransition(); const router = useRouter();
  const money = (amount: string) => formatCurrency(Number(amount), bond.currency);
  const field = (label: string, text: string) => <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{text}</dd></div>;
  const schedule = bond.fixedCoupon && bond.maturityDate ? scheduledBondCoupons(bond.fixedCoupon, asOf, bond.maturityDate, String(faceHeld)) : [];
  const contractualAccrued = bond.fixedCoupon?.dayCount === "30/360 US" && bond.maturityDate ? fixedBondAccrued(bond.fixedCoupon, asOf, String(faceHeld), bond.maturityDate) : null;
  const originalCoupons = bond.fixedCoupon && bond.maturityDate ? scheduledBondCoupons(bond.fixedCoupon, bond.settlementDate, bond.maturityDate, bond.faceAmount) : [];
  const originalGrossGain = originalCoupons.length ? originalCoupons.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(bond.faceAmount)).sub(bond.totalPaid) : null;
  function save() {
    if (!monthId || !positionId) return;
    let marketValue = normalizeLocaleNumberInput(value) ?? value;
    try {
      if (bond.faceValuePerBond && faceHeld > 0) {
        const remainingFace = new Prisma.Decimal(faceHeld).sub(normalizeLocaleNumberInput(redeemed) ?? (redeemed || "0"));
        let accruedInterest = "0";
        if (priceType === "Clean") {
          if (bond.fixedCoupon?.dayCount === "30/360 US" && bond.maturityDate) accruedInterest = fixedBondAccrued(bond.fixedCoupon, date, remainingFace.toFixed(), bond.maturityDate).toFixed();
          else {
            if (!quoteAccrued.trim()) throw new Error("Enter current accrued interest per bond.");
            accruedInterest = new Prisma.Decimal(normalizeLocaleNumberInput(quoteAccrued) ?? quoteAccrued).mul(remainingFace).div(bond.faceValuePerBond).toFixed();
          }
        }
        marketValue = remainingFace.eq(0) && Number(marketValue) === 0 ? "0" : bondPriceToHoldingValue({ price: marketValue, quantity: remainingFace.div(bond.faceValuePerBond).toFixed(), faceValuePerBond: bond.faceValuePerBond, priceBasis: priceBasis as "PerBond" | "Percent", priceType: priceType as "Clean" | "Dirty", accruedInterest });
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Review the price."); return; }
    start(async () => {
      const result = await updateBondAction({ monthId, positionId, date, source: "User Price", marketValue, ...(coupon.trim() ? { coupon: normalizeLocaleNumberInput(coupon) ?? coupon } : {}), ...(redeemed.trim() || principal.trim() ? { redeemedFace: normalizeLocaleNumberInput(redeemed) ?? redeemed, principalReceived: normalizeLocaleNumberInput(principal) ?? principal } : {}) });
      setMessage(result.message);
      if (result.ok) { setUndoToken(result.undoToken ?? null); setValue(""); setCoupon(""); setRedeemed(""); setPrincipal(""); router.refresh(); }
    });
  }
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="international-bond-panel">
    <h2 className="font-semibold">International Bond</h2>
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {field("ISIN / CUSIP", bond.identifier)}{field("Issuer", bond.issuer)}{field("Issuer Country", bond.issuerCountry)}
      {field("Bond Type", BOND_FAMILIES[bond.family])}{field("Bond Currency", bond.currency)}{field("Nominal Amount Held", money(String(faceHeld)))}
      {field("Original Total Paid, Including Interest and Fees", money(bond.totalPaid))}{field("Full Market Value", quote ? money(quote.marketValue) : "Unavailable")}
      {field("Price Date", quote?.date ?? "Unavailable")}
      {bond.maturityDate ? field("Maturity Date", bond.maturityDate) : null}
      {bond.fixedCoupon ? field("Annual Coupon", `${bond.fixedCoupon.annualRate}%`) : null}
      {schedule[0] ? field("Next Scheduled Coupon", `${schedule[0].date} · ${money(schedule[0].amount)} Gross`) : null}
      {contractualAccrued ? field(`Contractual Accrued Interest · ${asOf}`, money(contractualAccrued.toFixed())) : null}
      {bond.fixedCoupon ? field("Principal at Maturity · Remaining Holding", money(String(faceHeld))) : null}
      {originalGrossGain ? field("Original Purchase · Contractual Gross Gain to Maturity", money(originalGrossGain.toFixed())) : null}
    </dl>
    {schedule.length ? <div className="mt-4 space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Scheduled Coupons · Gross</h3>
      <div className="max-h-48 space-y-2 overflow-y-auto text-sm">{schedule.map((payment) => <div key={payment.date} className="flex justify-between gap-3"><span>{payment.date}</span><span>{money(payment.amount)}</span></div>)}</div>
      <p className="text-xs text-muted-foreground">Contractual dates · Before taxes · No reinvestment · Receipts recorded separately</p>
    </div> : null}
    {monthId && positionId && (faceHeld > 0 || undoToken) ? <div className="mt-5 space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Valuation / Cash Receipts</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={bond.faceValuePerBond && priceBasis === "Percent" ? "Current Price (%)" : `${bond.faceValuePerBond ? "Current Price per Bond" : "Position Value After Payment"} (${bond.currency})`}><input aria-label="Bond current price" inputMode="decimal" placeholder={bond.faceValuePerBond ? priceBasis === "Percent" ? "99.231" : "992.31" : "10150.00"} className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Valuation / Receipt Date"><DatePicker aria-label="Bond valuation date" value={date} onChange={setDate} /></Field>
        {bond.faceValuePerBond ? <Field label="Price Type"><Picker aria-label="Updated bond price type" searchable={false} value={priceType} onValueChange={setPriceType} options={[{ value: "Dirty", label: "Dirty Price · Includes Interest" }, { value: "Clean", label: "Clean Price · Excludes Interest" }]} /></Field> : null}
        {bond.faceValuePerBond ? <Field label="Price Format"><Picker aria-label="Updated bond price format" searchable={false} value={priceBasis} onValueChange={setPriceBasis} options={[{ value: "PerBond", label: `Amount per Bond (${bond.currency})` }, { value: "Percent", label: "Percentage of Face Value" }]} /></Field> : null}
        {bond.faceValuePerBond && priceType === "Clean" && bond.fixedCoupon?.dayCount !== "30/360 US" ? <Field label={`Current Accrued Interest per Bond (${bond.currency})`}><input aria-label="Current accrued interest per bond" inputMode="decimal" className={inputClass} value={quoteAccrued} onChange={(e) => setQuoteAccrued(e.target.value)} /></Field> : null}
        <Field label={`Coupon Received (${bond.currency}, Optional)`}><input aria-label="Bond coupon received" inputMode="decimal" className={inputClass} placeholder="250.00" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></Field>
        <Field label={`Face Amount Repaid (${bond.currency}, Optional)`}><input aria-label="Bond face amount repaid" inputMode="decimal" className={inputClass} placeholder="1000.00" value={redeemed} onChange={(e) => setRedeemed(e.target.value)} /></Field>
        <Field label={`Principal Received (${bond.currency}, Optional)`}><input aria-label="Bond principal received" inputMode="decimal" className={inputClass} placeholder="1000.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
      </div>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <div className="flex gap-2"><Button disabled={pending || faceHeld <= 0} onClick={save}>{pending ? "Saving…" : "Save Valuation"}</Button>{undoToken ? <Button variant="outline" disabled={pending} onClick={() => start(async () => { const result = await undoChangeAction(undoToken); setMessage(result.message); if (result.ok) { setUndoToken(null); router.refresh(); } })}>Undo Update</Button> : null}</div>
    </div> : null}
  </section>;
}
