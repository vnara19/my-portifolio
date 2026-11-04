"use client";
import { type InternationalBond, BOND_FAMILIES, scheduledBondCoupons, fixedBondAccrued, bondCostState, regularCouponMaturity } from "../domain/international-bond";
import { Prisma } from "@/generated/prisma/browser";
import { formatCurrency } from "../presentation/portfolio-format";
export function InternationalBondPanel({ bond, asOf, faceHeld }: { bond: InternationalBond; asOf: string; faceHeld: number }) {
  const atCost = bond.valuationMode === "Cost";
  const quote = bond.quotes.filter((q) => q.date <= asOf).sort((a, b) => b.date.localeCompare(a.date))[0];
  const money = (amount: string) => formatCurrency(Number(amount), bond.currency);
  const field = (label: string, text: string) => <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{text}</dd></div>;
  const schedule = bond.fixedCoupon && bond.maturityDate ? scheduledBondCoupons(bond.fixedCoupon, asOf, bond.maturityDate, String(faceHeld)) : [];
  const contractualAccrued = bond.fixedCoupon?.dayCount === "30/360 US" && bond.maturityDate && regularCouponMaturity(bond.fixedCoupon, bond.maturityDate) ? fixedBondAccrued(bond.fixedCoupon, asOf, String(faceHeld), bond.maturityDate) : null;
  const originalCoupons = bond.fixedCoupon && bond.maturityDate ? scheduledBondCoupons(bond.fixedCoupon, bond.settlementDate, bond.maturityDate, bond.faceAmount) : [];
  const originalGrossGain = originalCoupons.length ? originalCoupons.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(bond.faceAmount)).sub(bond.totalPaid) : null;
  return <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" data-testid="international-bond-panel">
    <h2 className="font-semibold">International Bond</h2>
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {field("ISIN / CUSIP", bond.identifier)}{field("Issuer", bond.issuer)}{field("Issuer Country", bond.issuerCountry)}
      {field("Bond Type", BOND_FAMILIES[bond.family])}{field("Bond Currency", bond.currency)}{field("Nominal Amount Held", money(String(faceHeld)))}
      {field("Original Total Paid, Including Interest and Fees", money(bond.totalPaid))}
      {atCost ? field("Carrying Value at Cost", money(bondCostState(bond, asOf).cost.toFixed())) : <>{field("Full Market Value", quote ? money(quote.marketValue) : "Unavailable")}{field("Price Date", quote?.date ?? "Unavailable")}</>}
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
      <p className="text-xs text-muted-foreground">Contractual dates · Before taxes · No reinvestment</p>
    </div> : null}
  </section>;
}
