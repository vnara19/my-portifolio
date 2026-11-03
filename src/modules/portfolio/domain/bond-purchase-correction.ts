import { Prisma } from "@/generated/prisma/browser";
import { internationalBondSchema, type InternationalBond } from "./international-bond";
/** A purchase quantity is in bonds; stored principal and coupon interest are totals. */
export function correctedBondPurchase(bond: InternationalBond, input: { date: string; units: string; totalPaid: string; accruedPerBond: string }) {
  if (!bond.faceValuePerBond) throw new Error("Face value per bond is required.");
  const units = new Prisma.Decimal(input.units);
  const accrued = new Prisma.Decimal(input.accruedPerBond);
  if (!units.isFinite() || units.lte(0) || !accrued.isFinite() || accrued.lt(0)) throw new Error("Enter valid purchase amounts.");
  return internationalBondSchema.parse({ ...bond, settlementDate: input.date, faceAmount: units.mul(bond.faceValuePerBond).toFixed(), totalPaid: input.totalPaid, accruedInterestPaid: units.mul(accrued).toFixed() });
}

/** Reject dependent receipts/trades before removing a purchase; automatic maturity is derived. */
export function bondPurchaseRemovalIssue(movements: { id: string; note: string | null; transferId: string | null }[], purchaseId: string, maturityExitNote: string) {
  if (!movements.some(entry => entry.id === purchaseId)) return "The original bond purchase is missing.";
  if (movements.some(entry => entry.transferId)) return "This bond has linked movements and cannot be removed separately.";
  if (movements.some(entry => entry.id !== purchaseId && entry.note !== maturityExitNote)) return "This bond has later transactions. Remove those before deleting the original purchase.";
  return null;
}
