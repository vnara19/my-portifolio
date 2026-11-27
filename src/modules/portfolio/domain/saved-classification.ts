type SavedClassification = {
  assetClass: string;
  subclass: string;
  duration: string;
  weight: { toString(): string };
  ratePercent: { toString(): string } | null;
};

/** Metadata edits preserve classifications, including legacy splits and income rates. */
export function sameSavedClassifications(left: readonly SavedClassification[], right: readonly SavedClassification[]) {
  const signature = (rows: readonly SavedClassification[]) => rows.map((row) => JSON.stringify([
    row.assetClass, row.subclass, row.duration, row.weight.toString(), row.ratePercent?.toString() ?? null,
  ])).sort();
  return JSON.stringify(signature(left)) === JSON.stringify(signature(right));
}
