import { z } from "zod";
import { bondDay } from "./international-bond";

// Only instrument terms belong here. Personal purchase values are never fetched.
export const bondLookupFieldsSchema = z.object({
  issuer: z.string().trim().min(1).max(60).optional(),
  issuerCountry: z.string().trim().min(2).max(60).optional(),
  family: z.enum(["Sovereign", "Corporate", "Agency", "Municipal", "Supranational", "CD", "Covered", "Securitized", "Other"]).optional(),
  currency: z.enum(["USD", "EUR"]).optional(),
  structure: z.enum(["Fixed", "Zero", "Floating", "Inflation", "Callable", "Amortizing", "Other"]).optional(),
  maturityDate: bondDay.optional(),
  faceValuePerBond: z.string().regex(/^\d+(\.\d{1,8})?$/).refine((s) => Number(s) > 0).optional(),
  annualRate: z.string().regex(/^\d+(\.\d{1,8})?$/).refine((s) => Number(s) > 0 && Number(s) <= 100).optional(),
  frequency: z.enum(["1", "2", "4", "12"]).optional(),
  anchorDate: bondDay.optional(),
});
export type BondLookupFields = z.infer<typeof bondLookupFieldsSchema>;
export type BondLookupSource = { name: string; url: string; fields: BondLookupFields; instrumentName?: string };
export type BondLookupResult = { identifier: string; instrumentName?: string; fields: BondLookupFields; sources: { name: string; url: string }[]; conflicts: (keyof BondLookupFields)[]; unavailable: string[] };

/** Disagreement leaves the field manual. Never choose a financial term by provider order. */
export function mergeBondSources(identifier: string, sources: BondLookupSource[], unavailable: string[] = []): BondLookupResult {
  const fields: BondLookupFields = {}, conflicts: (keyof BondLookupFields)[] = [];
  const keys = new Set(sources.flatMap((s) => Object.keys(s.fields) as (keyof BondLookupFields)[]));
  for (const key of keys) {
    const values = sources.map((s) => s.fields[key]).filter((v): v is NonNullable<typeof v> => v !== undefined);
    const normalized = (value: string) => /Rate|Value/.test(key) ? String(Number(value)) : value.trim().toLowerCase();
    if (new Set(values.map(normalized)).size > 1) conflicts.push(key);
    else Object.assign(fields, { [key]: values[0] });
  }
  return { identifier, instrumentName: sources.find((s) => s.instrumentName)?.instrumentName, fields, sources: sources.filter((s) => Object.keys(s.fields).length || s.instrumentName).map(({ name, url }) => ({ name, url })), conflicts, unavailable };
}

/** Only blank, untouched fields can be filled; late requests cannot overwrite manual edits. */
export function applyBondLookup<T extends Record<string, string>>(current: T, result: BondLookupResult, touched: ReadonlySet<string>): T {
  if (current.identifier.trim().toUpperCase() !== result.identifier) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(result.fields)) {
    if (key in next && !next[key] && !touched.has(key)) Object.assign(next, { [key]: value });
  }
  return next;
}
