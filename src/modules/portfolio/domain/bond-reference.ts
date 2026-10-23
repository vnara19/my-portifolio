import type { FixedBondCoupon } from "./international-bond";

type BondReference = { issuer: string; issuerCountry: string; currency: "USD" | "EUR"; family: "Sovereign" | "Corporate"; maturityDate: string; structure?: "Fixed" | "Zero"; annualRate?: string; faceValuePerBond?: string; fixedCoupon?: FixedBondCoupon; referenceUrl: string };
/** Verified instrument terms, not live market prices or a general security-master API. */
export function bondReference(identifier: string): BondReference | null {
  switch (identifier.trim().toUpperCase()) {
    case "US172967KU42": case "172967KU4":
      return { issuer: "Citigroup Inc.", issuerCountry: "United States", currency: "USD", family: "Corporate", maturityDate: "2028-07-25", faceValuePerBond: "1000", fixedCoupon: { annualRate: "4.125", frequency: 2, anchorDate: "2027-01-25", dayCount: "30/360 US", accrualStartDate: "2016-07-25" }, referenceUrl: "https://www.sec.gov/Archives/edgar/data/831001/000119312516656556/d220719dex401.htm" };
    case "US105756BK57": case "105756BK5":
      return { issuer: "Federative Republic of Brazil", issuerCountry: "Brazil", currency: "USD", family: "Sovereign", maturityDate: "2037-01-20", fixedCoupon: { annualRate: "7.125", frequency: 2, anchorDate: "2027-01-20", dayCount: "Manual", accrualStartDate: "2006-01-18" }, referenceUrl: "https://www.sec.gov/Archives/edgar/data/205317/000119312506005040/dfwp.htm" };
    case "IE00BV8C9B83":
      return { issuer: "Ireland", issuerCountry: "Ireland", currency: "EUR", family: "Sovereign", maturityDate: "2037-05-15", fixedCoupon: { annualRate: "1.7", frequency: 1, anchorDate: "2027-05-15", dayCount: "Manual", accrualStartDate: "2017-01-11" }, referenceUrl: "https://www.ntma.ie/download/FINAL-OFFERING-CIRCULAR-2037-BOND.pdf" };
    case "FR0014007L00":
      return { issuer: "French Republic", issuerCountry: "France", currency: "EUR", family: "Sovereign", maturityDate: "2032-05-25", structure: "Zero", referenceUrl: "https://www.aft.gouv.fr/fr/titre/fr0014007l00" };
    case "ES0000012B88":
      return { issuer: "Kingdom of Spain", issuerCountry: "Spain", currency: "EUR", family: "Sovereign", maturityDate: "2028-07-30", structure: "Fixed", annualRate: "1.4", referenceUrl: "https://www.cnmv.es/portal/ancv/isin?isin=ES0000012B88&lang=es" };
    case "IT0005425233":
      return { issuer: "Republic of Italy", issuerCountry: "Italy", currency: "EUR", family: "Sovereign", maturityDate: "2051-09-01", structure: "Fixed", annualRate: "1.7", referenceUrl: "https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticoloDefault/originario?atto.codiceRedazionale=22A02653&atto.dataPubblicazioneGazzetta=2022-05-02&atto.tipoProvvedimento=DECRETO" };
    default: return null;
  }
}
