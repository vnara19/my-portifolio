import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";

/** A public offer is a reference for its publication day, never a personal execution. */
export function treasuryPurchaseReference(bond: TreasuryCatalogBond | null, purchaseDay: string) {
  if (!bond || bond.offered !== true || bond.quoteDate !== purchaseDay || !bond.purchasePrice || !Number.isFinite(bond.purchasePrice) || bond.purchasePrice <= 0 || bond.purchaseRate === undefined || !Number.isFinite(bond.purchaseRate)) return null;
  return { price: String(bond.purchasePrice), rate: String(bond.purchaseRate) };
}

export function treasuryYieldLabel(indexer?: string) {
  if (/IPCA/i.test(indexer ?? "")) return "Annual yield above IPCA (%)";
  if (/IGPM|IGP-M/i.test(indexer ?? "")) return "Annual yield above IGP-M (%)";
  if (/Selic/i.test(indexer ?? "")) return "Annual spread over Selic (%)";
  return "Fixed annual yield (%)";
}
