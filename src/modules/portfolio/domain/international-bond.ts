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
  quotes: z.array(bondQuoteSchema).min(1).max(5000),
}).superRefine((bond, ctx) => {
  if (new Prisma.Decimal(bond.accruedInterestPaid).gte(bond.totalPaid)) ctx.addIssue({ code: "custom", path: ["accruedInterestPaid"], message: "Accrued interest must be less than the total paid." });
  if (bond.maturityDate && bond.maturityDate <= bond.settlementDate) ctx.addIssue({ code: "custom", path: ["maturityDate"], message: "Maturity must follow settlement." });
  if (bond.quotes.some((quote) => quote.date < bond.settlementDate)) ctx.addIssue({ code: "custom", path: ["quotes"], message: "A quote cannot precede settlement." });
  if (new Set(bond.quotes.map((quote) => quote.date)).size !== bond.quotes.length) ctx.addIssue({ code: "custom", path: ["quotes"], message: "Keep one closing valuation per date." });
});
export type InternationalBond = z.infer<typeof internationalBondSchema>;
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
