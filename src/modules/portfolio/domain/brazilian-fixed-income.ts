import { z } from "zod";

export const BRAZILIAN_DEBT_PRODUCTS = ["CDB", "LCI", "LCA"] as const;

export const brazilianFixedIncomeSchema = z.object({
  product: z.enum(BRAZILIAN_DEBT_PRODUCTS),
  issuer: z.string().trim().min(1).max(40),
  indexer: z.enum(["CDI", "PRE", "IPCA"]),
  rate: z.string().regex(/^\d+(?:\.\d{1,4})?$/).refine((value) => Number(value) > 0 && Number(value) <= 1000),
  taxMode: z.enum(["GROSS", "NET_BR"]).optional(),
  balanceOnly: z.boolean().optional(),
  basis: z.enum(["BUSINESS_252", "CALENDAR_365"]),
});
export type BrazilianFixedIncome = z.infer<typeof brazilianFixedIncomeSchema>;

export function fixedIncomeName(contract: BrazilianFixedIncome, maturity: string, purchaseDay: string) {
  const rate = contract.indexer === "CDI" ? `${contract.rate}% CDI` : contract.indexer === "IPCA" ? `IPCA+${contract.rate}%` : `${contract.rate}%`;
  return `${contract.product} ${contract.issuer.slice(0, 24)} ${rate} · ${maturity || "No Maturity Date"} · ${purchaseDay}`.slice(0, 80);
}

export function fixedIncomeAllocation(contract: BrazilianFixedIncome, purchaseDay: string, maturity: string) {
  const two = new Date(`${purchaseDay}T00:00:00Z`);
  const five = new Date(`${purchaseDay}T00:00:00Z`);
  two.setUTCFullYear(two.getUTCFullYear() + 2);
  five.setUTCFullYear(five.getUTCFullYear() + 5);
  return { assetClass: "Renda Fixa", subclass: contract.indexer === "CDI" ? "Pós-fixado" : contract.indexer === "PRE" ? "Prefixado" : "IPCA", duration: !maturity ? "-" : Date.parse(maturity) <= two.getTime() ? "Curto" : Date.parse(maturity) <= five.getTime() ? "Médio" : "Longo" };
}

export function readFixedIncomeContract(value: unknown): BrazilianFixedIncome | null {
  const result = brazilianFixedIncomeSchema.safeParse(value);
  return result.success ? result.data : null;
}
