import { bondReference } from "../domain/bond-reference";
import { mergeBondSources, type BondLookupResult, type BondLookupSource } from "../domain/bond-lookup";
import { validBondIdentifier, scheduledBondCoupons } from "../domain/international-bond";
import { ntmaBond, germanBond, esmBond, frenchBond, spanishBond } from "@/modules/quotes/infrastructure/official-bond-terms";
import { openFigiBond, treasuryBond } from "@/modules/quotes/infrastructure/bond-reference";

const defaultProviders = [openFigiBond, treasuryBond, ntmaBond, germanBond, esmBond, frenchBond, spanishBond];
const providerNames = ["OpenFIGI", "U.S. Treasury", "NTMA", "German Finance Agency", "ESM / EFSF", "Agence France Trésor", "CNMV"];
const cache = new Map<string, { expires: number; result: BondLookupResult }>();
export async function lookupBond(raw: string, providers = defaultProviders): Promise<BondLookupResult> {
  const identifier = raw.trim().toUpperCase();
  if (!validBondIdentifier(identifier)) throw new Error("Enter a valid ISIN or CUSIP.");
  const cached = providers === defaultProviders ? cache.get(identifier) : undefined;
  if (cached && cached.expires > Date.now()) return cached.result;
  const results = await Promise.allSettled(providers.map((p) => p(identifier)));
  const sources: BondLookupSource[] = [], unavailable: string[] = [];
  results.forEach((r, i) => { if (r.status === "fulfilled") { if (r.value) sources.push(r.value); } else unavailable.push(providerNames[i] ?? "Bond reference"); });
  const known = bondReference(identifier);
  if (known) {
    const nextCoupon = known.fixedCoupon ? scheduledBondCoupons(known.fixedCoupon, new Date().toISOString().slice(0, 10), known.maturityDate, "1")[0]?.date ?? known.fixedCoupon.anchorDate : undefined;
    sources.push({ name: "Issuer reference", url: known.referenceUrl, fields: {
      issuer: known.issuer, issuerCountry: known.issuerCountry, currency: known.currency, family: known.family, maturityDate: known.maturityDate,
      ...(known.structure ? { structure: known.structure } : {}), ...(known.annualRate ? { annualRate: known.annualRate } : {}),
      ...(known.faceValuePerBond ? { faceValuePerBond: known.faceValuePerBond } : {}),
      ...(known.fixedCoupon ? { structure: "Fixed", annualRate: known.fixedCoupon.annualRate, frequency: String(known.fixedCoupon.frequency) as "1" | "2" | "4" | "12", anchorDate: nextCoupon! } : {}),
    } });
  }
  const result = mergeBondSources(identifier, sources, unavailable);
  if (providers === defaultProviders) {
    if (cache.size > 300) cache.clear();
    cache.set(identifier, { result, expires: Date.now() + (unavailable.length ? 30_000 : 3_600_000) });
  }
  return result;
}
