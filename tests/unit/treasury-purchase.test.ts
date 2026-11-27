import assert from "node:assert/strict";
import { test } from "node:test";
import { treasuryYieldLabel, treasuryIndexerLabel } from "@/modules/portfolio/domain/treasury-purchase";
test("yield labels distinguish inflation spread, Selic spread and fixed annual yield", () => {
  assert.equal(treasuryYieldLabel("IPCA"), "Annual yield above IPCA (%)");
  assert.equal(treasuryYieldLabel("IGP-M"), "Annual yield above IGP-M (%)");
  assert.equal(treasuryYieldLabel("SELIC"), "Annual spread over Selic (%)");
  assert.equal(treasuryYieldLabel("prefixado"), "Fixed annual yield (%)");
});


test("official indexer labels preserve acronyms and normalize display capitalization", () => {
  assert.equal(treasuryIndexerLabel("prefixado"), "Prefixado");
  assert.equal(treasuryIndexerLabel("SELIC"), "Selic");
  assert.equal(treasuryIndexerLabel("IPCA"), "IPCA");
  assert.equal(treasuryIndexerLabel("IGPM"), "IGP-M");
});
