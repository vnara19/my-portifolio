import { Prisma } from "@/generated/prisma/browser";
import { bondReference } from "./bond-reference";
import { bondDay, fixedBondCouponSchema, internationalBondSchema, purchaseBondInterest } from "./international-bond";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
export const emptyBondFields = () => ({ identifier: "", issuer: "", issuerCountry: "", family: "", currency: "", structure: "", quantity: "", faceValuePerBond: "", settlementDate: "", maturityDate: "", totalPaid: "", purchaseAccruedPerBond: "", annualRate: "", frequency: "", anchorDate: "", dayCount: "Manual" });
export type BondEntryFields = ReturnType<typeof emptyBondFields>;
export const bondEntryLabels: Record<string, string> = { identifier: "ISIN / CUSIP", issuer: "Issuer", issuerCountry: "Issuer Country", family: "Bond Type", currency: "Bond Currency", structure: "Structure", faceValuePerBond: "Face Value per Bond", maturityDate: "Maturity Date", annualRate: "Annual Coupon Rate", frequency: "Coupon Frequency", anchorDate: "Next Scheduled Coupon Date", purchaseAccruedPerBond: "Purchase Accrued Interest per Bond", quantity: "Quantity Purchased", settlementDate: "Purchase Date", totalPaid: "Total Paid, Including Fees" };
export function validateBondEntry(fields: BondEntryFields, latestPurchaseDay = new Date().toISOString().slice(0, 10)) {
  const number = (key: keyof BondEntryFields) => normalizeLocaleNumberInput(fields[key]) ?? fields[key];
  const errors: Record<string, string> = {};
  const required = Object.keys(bondEntryLabels).filter((key) => fields.structure === "Fixed" || !["annualRate", "frequency", "anchorDate"].includes(key)).filter((key) => fields.structure !== "Zero" || key !== "purchaseAccruedPerBond");
  for (const key of required) if (!fields[key as keyof BondEntryFields].trim()) errors[key] = `Enter ${bondEntryLabels[key].toLowerCase()}.`;
  let faceAmount = "", accruedInterestPaid = "";
  try {
    const quantity = number("quantity"), face = number("faceValuePerBond");
    // Both share the domain's bounded positive decimal contract.
    if (!internationalBondSchema.shape.faceAmount.safeParse(quantity).success) errors.quantity = "Enter a positive quantity.";
    if (!internationalBondSchema.shape.faceAmount.safeParse(face).success) errors.faceValuePerBond = "Enter a positive face value.";
    if (!errors.quantity && !errors.faceValuePerBond) {
      const { Decimal } = Prisma;
      faceAmount = new Decimal(quantity).mul(face).toFixed();
      accruedInterestPaid = purchaseBondInterest(fields.structure === "Zero" && !fields.purchaseAccruedPerBond.trim() ? "0" : number("purchaseAccruedPerBond"), quantity);
    }
  } catch { errors.purchaseAccruedPerBond = "Enter purchase accrued interest, or 0 if none was paid."; }
  const coupon = fields.structure === "Fixed" ? fixedBondCouponSchema.safeParse({ annualRate: number("annualRate"), frequency: Number(fields.frequency), anchorDate: fields.anchorDate, dayCount: fields.dayCount, accrualStartDate: bondReference(fields.identifier)?.fixedCoupon?.accrualStartDate }) : null;
  if (coupon && !coupon.success) for (const issue of coupon.error.issues) errors[String(issue.path[0])] = "Review the coupon terms.";
  if (!bondDay.safeParse(fields.maturityDate).success) errors.maturityDate = "Enter the maturity date.";
  if (fields.settlementDate > latestPurchaseDay) errors.settlementDate = "Purchase date cannot follow the reporting date.";
  const parsed = internationalBondSchema.safeParse({ type: "international-bond", ...fields, faceAmount, accruedInterestPaid, faceValuePerBond: number("faceValuePerBond"), totalPaid: number("totalPaid"), ...(coupon?.success ? { fixedCoupon: coupon.data } : {}), valuationMode: "Cost", quotes: [] });
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    const key = field === "accruedInterestPaid" ? "purchaseAccruedPerBond" : field === "fixedCoupon" ? "anchorDate" : field === "faceAmount" ? "quantity" : field;
    errors[key] ??= issue.message;
  }
  return { errors, required, parsed, calculated: faceAmount && accruedInterestPaid ? { faceAmount, accruedInterestPaid } : null };
}
