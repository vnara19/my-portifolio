import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";

const amount = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine((v) => Number(v) > 0 && Number(v) < 1e14, "Enter a positive amount.");
export const bondDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => v >= "2000-01-01" && v <= "2100-12-31" && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export function validBondIdentifier(value: string) {
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) {
    const digits = [...value].map((c) => parseInt(c, 36).toString()).join("");
    return [...digits].reverse().reduce((sum, c, i) => { const n = Number(c) * (i % 2 ? 2 : 1); return sum + Math.floor(n / 10) + n % 10; }, 0) % 10 === 0;
  }
  if (!/^[A-Z0-9*@#]{8}\d$/.test(value)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ*@#";
  const sum = [...value.slice(0, 8)].reduce((sum, c, i) => { const n = chars.indexOf(c) * (i % 2 ? 2 : 1); return sum + Math.floor(n / 10) + n % 10; }, 0);
  return (10 - sum % 10) % 10 === Number(value[8]);
}
export const BOND_FAMILIES = { Sovereign: "Government Bonds", Corporate: "Corporate Bonds", Agency: "Agency Bonds", Municipal: "Municipal Bonds", Supranational: "Supranational Bonds", CD: "Negotiable CDs", Covered: "Covered Bonds", Securitized: "Securitized Bonds", Other: "Other Debt Securities" } as const;
const nonnegative = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine((v) => Number(v) >= 0 && Number(v) < 1e14);
export const bondQuoteSchema = z.object({ date: bondDay, marketValue: nonnegative, source: z.string().trim().min(1).max(80) });
// Regular, non-amortizing fixed coupons only. Other structures retain actual cash receipts.
export const fixedBondCouponSchema = z.object({
  annualRate: amount.refine((v) => Number(v) <= 100, "Enter an annual coupon rate up to 100%."),
  frequency: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]),
  anchorDate: bondDay,
  dayCount: z.enum(["30/360 US", "Manual"]),
  accrualStartDate: bondDay.optional(),
});
export type FixedBondCoupon = z.infer<typeof fixedBondCouponSchema>;
export const internationalBondSchema = z.object({
  type: z.literal("international-bond"),
  identifier: z.string().trim().toUpperCase().refine(validBondIdentifier, "Enter a valid ISIN or CUSIP."),
  issuer: z.string().trim().min(1).max(60),
  issuerCountry: z.string().trim().min(2).max(60),
  family: z.enum(["Sovereign", "Corporate", "Agency", "Municipal", "Supranational", "CD", "Covered", "Securitized", "Other"]),
  currency: z.enum(["USD", "EUR"]),
  structure: z.enum(["Fixed", "Zero", "Floating", "Inflation", "Callable", "Amortizing", "Other"]),
  faceAmount: amount,
  settlementDate: bondDay,
  maturityDate: bondDay.nullable(),
  totalPaid: amount,
  accruedInterestPaid: nonnegative.default("0"),
  fixedCoupon: fixedBondCouponSchema.optional(),
  faceValuePerBond: amount.optional(),
  quotes: z.array(bondQuoteSchema).min(1).max(5000),
}).superRefine((bond, ctx) => {
  if (new Prisma.Decimal(bond.accruedInterestPaid).gte(bond.totalPaid)) ctx.addIssue({ code: "custom", path: ["accruedInterestPaid"], message: "Accrued interest must be less than the total paid." });
  if (bond.maturityDate && bond.maturityDate <= bond.settlementDate) ctx.addIssue({ code: "custom", path: ["maturityDate"], message: "Maturity must follow settlement." });
  if (bond.quotes.some((quote) => quote.date < bond.settlementDate)) ctx.addIssue({ code: "custom", path: ["quotes"], message: "A quote cannot precede settlement." });
  if (new Set(bond.quotes.map((quote) => quote.date)).size !== bond.quotes.length) ctx.addIssue({ code: "custom", path: ["quotes"], message: "Keep one closing valuation per date." });
  if (bond.fixedCoupon && (bond.structure !== "Fixed" || !bond.maturityDate || !regularCouponMaturity(bond.fixedCoupon, bond.maturityDate))) ctx.addIssue({ code: "custom", path: ["fixedCoupon"], message: "Coupon dates must follow a regular schedule ending at maturity. Use manual receipts for irregular bonds." });
  if (bond.fixedCoupon?.accrualStartDate && bond.settlementDate < bond.fixedCoupon.accrualStartDate) ctx.addIssue({ code: "custom", path: ["settlementDate"], message: "Settlement cannot precede the bond's interest start date." });
});
export type InternationalBond = z.infer<typeof internationalBondSchema>;
/** Entry is per bond; stored acquisition interest is for the whole holding. */
export function purchaseBondInterest(perBond: string, quantity: string) {
  nonnegative.parse(perBond);
  amount.parse(quantity);
  return new Prisma.Decimal(perBond).mul(quantity).toDecimalPlaces(8).toFixed();
}
export function readInternationalBond(value: unknown): InternationalBond | null { const parsed = internationalBondSchema.safeParse(value); return parsed.success ? parsed.data : null; }
export function bondName(bond: InternationalBond) { return `${bond.issuer.slice(0, 28)} · ${bond.identifier} · ${bond.settlementDate}`; }
export function bondAllocation(bond: InternationalBond) {
  return { assetClass: "Renda Fixa", subclass: bond.structure === "Floating" ? "Pós-fixado" : bond.structure === "Inflation" ? "Inflation Linked" : bond.structure === "Fixed" || bond.structure === "Zero" ? "Prefixado" : "International Bonds", duration: bond.maturityDate && Date.parse(bond.maturityDate) - Date.parse(bond.settlementDate) <= 2 * 366 * 86400000 ? "Curto" : bond.maturityDate && Date.parse(bond.maturityDate) - Date.parse(bond.settlementDate) <= 5 * 366 * 86400000 ? "Médio" : "Longo" };
}
/** A full broker valuation includes accrued interest and principal/index factors. It is never a clean bond quote. */
export function bondValue(bond: InternationalBond, asOf: string, fxBrl: string | number, faceHeld: string = bond.faceAmount) {
  const quote = bond.quotes.filter((q) => q.date <= asOf).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!quote) throw new Error("No dated full market value is available for this reporting month.");
  const fx = new Prisma.Decimal(fxBrl);
  if (!fx.isFinite() || fx.lte(0)) throw new Error("The bond currency exchange rate is unavailable.");
  const total = new Prisma.Decimal(quote.marketValue).mul(fx);
  return { quote, unitPriceBrl: new Prisma.Decimal(faceHeld).gt(0) ? total.div(faceHeld).toDecimalPlaces(8) : new Prisma.Decimal(0), totalBrl: total.toDecimalPlaces(2) };
}

function shiftCouponDate(anchor: string, months: number) {
  const [year, month, day] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}
function couponOffset(terms: FixedBondCoupon, day: string) {
  const a = new Date(`${terms.anchorDate}T00:00:00Z`), b = new Date(`${day}T00:00:00Z`);
  return Math.floor(((b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()) / (12 / terms.frequency));
}
export function regularCouponMaturity(terms: FixedBondCoupon, maturity: string) {
  return terms.anchorDate <= maturity && shiftCouponDate(terms.anchorDate, couponOffset(terms, maturity) * (12 / terms.frequency)) === maturity;
}
/** Contractual dates, without guessing broker credit dates or holiday adjustments. */
export function scheduledBondCoupons(terms: FixedBondCoupon, after: string, maturity: string, faceHeld: string) {
  if (!regularCouponMaturity(terms, maturity)) throw new Error("The maturity does not match the regular coupon schedule.");
  const result: { date: string; amount: string }[] = [];
  const amount = new Prisma.Decimal(faceHeld).mul(terms.annualRate).div(100).div(terms.frequency).toDecimalPlaces(8).toFixed();
  let offset = couponOffset(terms, after);
  for (let i = 0; i < 1300; i++, offset++) {
    const date = shiftCouponDate(terms.anchorDate, offset * (12 / terms.frequency));
    if (date > maturity) break;
    if (date > after && (!terms.accrualStartDate || date > terms.accrualStartDate)) result.push({ date, amount });
  }
  return result;
}
function days30360US(start: string, end: string) {
  const [y1, m1, originalD1] = start.split("-").map(Number);
  const [y2, m2, originalD2] = end.split("-").map(Number);
  const lastFeb = (y: number, m: number, d: number) => m === 2 && d === new Date(Date.UTC(y, 2, 0)).getUTCDate();
  const d1 = originalD1 === 31 || lastFeb(y1, m1, originalD1) ? 30 : originalD1;
  const d2 = (originalD2 === 31 && d1 === 30) || (lastFeb(y1, m1, originalD1) && lastFeb(y2, m2, originalD2)) ? 30 : originalD2;
  return 360 * (y2 - y1) + 30 * (m2 - m1) + d2 - d1;
}
export function fixedBondAccrued(terms: FixedBondCoupon, date: string, faceHeld: string, maturity: string) {
  bondDay.parse(date);
  if (terms.accrualStartDate && date < terms.accrualStartDate) throw new Error("The date precedes the bond's interest start date.");
  if (terms.dayCount !== "30/360 US") throw new Error("Enter accrued interest from the broker for this interest basis.");
  if (!regularCouponMaturity(terms, maturity)) throw new Error("The maturity does not match the regular coupon schedule.");
  if (date >= maturity) return new Prisma.Decimal(0);
  let offset = couponOffset(terms, date);
  let previous = shiftCouponDate(terms.anchorDate, offset * (12 / terms.frequency));
  if (previous > date) previous = shiftCouponDate(terms.anchorDate, --offset * (12 / terms.frequency));
  return new Prisma.Decimal(faceHeld).mul(terms.annualRate).div(100).mul(days30360US(previous, date)).div(360).toDecimalPlaces(8);
}
export function bondPriceToHoldingValue(input: { price: string; quantity: string; faceValuePerBond: string; priceBasis: "PerBond" | "Percent"; priceType: "Clean" | "Dirty"; accruedInterest: string }) {
  const { price, quantity, faceValuePerBond, accruedInterest } = input;
  for (const v of [price, quantity, faceValuePerBond, accruedInterest]) if (!nonnegative.safeParse(v).success) throw new Error("Enter valid bond amounts.");
  if (new Prisma.Decimal(quantity).lte(0) || new Prisma.Decimal(faceValuePerBond).lte(0)) throw new Error("Quantity and face value must be positive.");
  const cleanOrDirty = new Prisma.Decimal(price).mul(quantity).mul(input.priceBasis === "Percent" ? new Prisma.Decimal(faceValuePerBond).div(100) : 1);
  return cleanOrDirty.add(input.priceType === "Clean" ? accruedInterest : 0).toDecimalPlaces(8).toFixed();
}
