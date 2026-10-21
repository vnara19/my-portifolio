export function treasuryYieldLabel(indexer?: string) {
  if (/IPCA/i.test(indexer ?? "")) return "Annual yield above IPCA (%)";
  if (/IGPM|IGP-M/i.test(indexer ?? "")) return "Annual yield above IGP-M (%)";
  if (/Selic/i.test(indexer ?? "")) return "Annual spread over Selic (%)";
  return "Fixed annual yield (%)";
}


export function treasuryIndexerLabel(indexer?: string) {
  if (/^prefixado$/i.test(indexer ?? "")) return "Prefixado";
  if (/^selic$/i.test(indexer ?? "")) return "Selic";
  if (/^ipca$/i.test(indexer ?? "")) return "IPCA";
  if (/^(IGPM|IGP-M)$/i.test(indexer ?? "")) return "IGP-M";
  return indexer?.trim() ?? "";
}
