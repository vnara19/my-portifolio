import { bondReference } from "../domain/bond-reference";
import { mergeBondSources, type BondLookupResult, type BondLookupSource } from "../domain/bond-lookup";
import { validBondIdentifier } from "../domain/international-bond";
import { openFigiBond, treasuryBond } from "@/modules/quotes/infrastructure/bond-reference";

const cache = new Map<string, { expires: number; result: BondLookupResult }>();
export async function lookupBond(raw: string, providers = [openFigiBond, treasuryBond]): Promise<BondLookupResult> {
  const identifier = raw.trim().toUpperCase();
  if (!validBondIdentifier(identifier)) throw new Error("Enter a valid ISIN or CUSIP.");
  const cached = providers.length === 2 && providers[0] === openFigiBond ? cache.get(identifier) : undefined;
  if (cached && cached.expires > Date.now()) return cached.result;
  const results = await Promise.allSettled(providers.map((p) => p(identifier)));
  const sources: BondLookupSource[] = [], unavailable: string[] = [];
  results.forEach((r, i) => { if (r.status === "fulfilled") { if (r.value) sources.push(r.value); } else unavailable.push(i === 0 ? "OpenFIGI" : "U.S. Treasury"); });
  const known = bondReference(identifier);
  if (known) {
    sources.push({ name: "Issuer reference", url: known.referenceUrl, fields: {
      issuer: known.issuer, issuerCountry: known.issuerCountry, currency: known.currency, family: known.family, maturityDate: known.maturityDate,
      ...(known.faceValuePerBond ? { faceValuePerBond: known.faceValuePerBond } : {}),
      ...(known.fixedCoupon ? { structure: "Fixed", annualRate: known.fixedCoupon.annualRate, frequency: String(known.fixedCoupon.frequency) as "1" | "2" | "4" | "12", anchorDate: known.fixedCoupon.anchorDate } : {}),
    } });
  }
  const result = mergeBondSources(identifier, sources, unavailable);
  if (providers.length === 2 && providers[0] === openFigiBond) {
    if (cache.size > 300) cache.clear();
    cache.set(identifier, { result, expires: Date.now() + (unavailable.length ? 30_000 : 3_600_000) });
  }
  return result;
}
