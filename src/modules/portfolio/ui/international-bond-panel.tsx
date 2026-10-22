"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoChangeAction } from "@/app/actions/edit-month";
import { updateBondAction } from "@/app/actions/international-bonds";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { type InternationalBond, BOND_FAMILIES } from "../domain/international-bond";
import { formatCurrency, normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import { Field, inputClass } from "./edit-dialogs";
export function InternationalBondPanel({ bond, asOf, monthId, positionId, faceHeld }: { bond: InternationalBond; asOf: string; monthId: string | null; positionId: string | null; faceHeld: number }) {
  const quote = bond.quotes.filter((q) => q.date <= asOf).sort((a, b) => b.date.localeCompare(a.date))[0];
  const [value, setValue] = useState(""); const [date, setDate] = useState(""); const [source, setSource] = useState("IBKR"); const [coupon, setCoupon] = useState("");
  const [redeemed, setRedeemed] = useState(""); const [principal, setPrincipal] = useState("");
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [pending, start] = useTransition(); const router = useRouter();
  const money = (amount: string) => formatCurrency(Number(amount), bond.currency);
  const field = (label: string, text: string) => <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{text}</dd></div>;
  function save() {
    if (!monthId || !positionId) return;
    start(async () => {
      const result = await updateBondAction({ monthId, positionId, date, source, marketValue: normalizeLocaleNumberInput(value) ?? value, ...(coupon.trim() ? { coupon: normalizeLocaleNumberInput(coupon) ?? coupon } : {}), ...(redeemed.trim() || principal.trim() ? { redeemedFace: normalizeLocaleNumberInput(redeemed) ?? redeemed, principalReceived: normalizeLocaleNumberInput(principal) ?? principal } : {}) });
      setMessage(result.message);
      if (result.ok) { setUndoToken(result.undoToken ?? null); setValue(""); setCoupon(""); setRedeemed(""); setPrincipal(""); router.refresh(); }
    });
  }
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="international-bond-panel">
    <h2 className="font-semibold">International Bond</h2>
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {field("ISIN / CUSIP", bond.identifier)}{field("Issuer", bond.issuer)}{field("Issuer Country", bond.issuerCountry)}
      {field("Bond Type", BOND_FAMILIES[bond.family])}{field("Bond Currency", bond.currency)}{field("Face Amount Held", money(String(faceHeld)))}
      {field("Original Total Paid, Including Interest and Fees", money(bond.totalPaid))}{field("Full Market Value", quote ? money(quote.marketValue) : "Unavailable")}
      {field("Valuation Date", quote?.date ?? "Unavailable")}{field("Price Source", quote?.source ?? "Unavailable")}
    </dl>
    <p className="mt-4 text-xs text-muted-foreground">Manual Valuation · Includes Accrued Interest · No Automatic Price Feed</p>
    {monthId && positionId && (faceHeld > 0 || undoToken) ? <div className="mt-5 space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Valuation / Cash Receipts</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`Full Market Value After Coupon (${bond.currency})`}><input aria-label="Full bond market value" inputMode="decimal" placeholder="10150.00" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Valuation / Receipt Date"><DatePicker aria-label="Bond valuation date" value={date} onChange={setDate} /></Field>
        <Field label="Price Source"><input aria-label="Bond price source" className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} /></Field>
        <Field label={`Coupon Received (${bond.currency}, Optional)`}><input aria-label="Bond coupon received" inputMode="decimal" className={inputClass} placeholder="250.00" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></Field>
        <Field label={`Face Amount Repaid (${bond.currency}, Optional)`}><input aria-label="Bond face amount repaid" inputMode="decimal" className={inputClass} placeholder="1000.00" value={redeemed} onChange={(e) => setRedeemed(e.target.value)} /></Field>
        <Field label={`Principal Received (${bond.currency}, Optional)`}><input aria-label="Bond principal received" inputMode="decimal" className={inputClass} placeholder="1000.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
      </div>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <div className="flex gap-2"><Button disabled={pending || faceHeld <= 0} onClick={save}>{pending ? "Saving…" : "Save Valuation"}</Button>{undoToken ? <Button variant="outline" disabled={pending} onClick={() => start(async () => { const result = await undoChangeAction(undoToken); setMessage(result.message); if (result.ok) { setUndoToken(null); router.refresh(); } })}>Undo Update</Button> : null}</div>
    </div> : null}
  </section>;
}
