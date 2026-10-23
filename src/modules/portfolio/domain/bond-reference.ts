import type { FixedBondCoupon } from "./international-bond";

type BondReference = { issuer: string; issuerCountry: string; currency: "USD" | "EUR"; family: "Sovereign" | "Corporate"; maturityDate: string; faceValuePerBond?: string; fixedCoupon?: FixedBondCoupon; referenceUrl: string };
/** Verified instrument terms, not live market prices or a general security-master API. */
export function bondReference(identifier: string): BondReference | null {
  switch (identifier.trim().toUpperCase()) {
    case "US172967KU42": case "172967KU4":
      return { issuer: "Citigroup Inc.", issuerCountry: "United States", currency: "USD", family: "Corporate", maturityDate: "2028-07-25", faceValuePerBond: "1000", fixedCoupon: { annualRate: "4.125", frequency: 2, anchorDate: "2027-01-25", dayCount: "30/360 US", accrualStartDate: "2016-07-25" }, referenceUrl: "https://www.sec.gov/Archives/edgar/data/831001/000119312516656556/d220719dex401.htm" };
    case "US105756BK57": case "105756BK5":
      return { issuer: "Federative Republic of Brazil", issuerCountry: "Brazil", currency: "USD", family: "Sovereign", maturityDate: "2037-01-20", referenceUrl: "https://www.sec.gov/edgar/search/" };
    case "IE00BV8C9B83":
      return { issuer: "Ireland", issuerCountry: "Ireland", currency: "EUR", family: "Sovereign", maturityDate: "2037-05-15", referenceUrl: "https://www.ntma.ie/business-areas/funding-and-debt-management" };
    default: return null;
  }
}
