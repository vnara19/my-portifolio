import { bondValue, type InternationalBond } from './international-bond';

/** A bond's daily value follows its saved valuation mode, including cost-only holdings. */
export function bondReportingUnitPrice(bond: InternationalBond, day: string, nativeFx: number | null, reportingFx: number | null): number | null {
  if (day < bond.settlementDate || nativeFx === null || reportingFx === null || !Number.isFinite(nativeFx) || !Number.isFinite(reportingFx) || nativeFx <= 0 || reportingFx <= 0) return null;
  try { return bondValue(bond, day, nativeFx).unitPriceBrl.toNumber() / reportingFx; }
  catch { return null; }
}
