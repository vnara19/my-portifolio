import assert from "node:assert/strict";
import { test } from "node:test";
import { treasuryPurchaseReference, treasuryYieldLabel } from "@/modules/portfolio/domain/treasury-purchase";
import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";

const bond: TreasuryCatalogBond = { symbol: "TD:TESOURO-IPCA:2035-05-15", providerId: "Tesouro IPCA+|2035-05-15", name: "Tesouro IPCA+ 2035", type: "Tesouro IPCA+", maturityDate: "2035-05-15", quoteDate: "2026-10-21", valueBrl: 2000, purchasePrice: 2100.25, purchaseRate: 7.23, offered: true, indexer: "IPCA" };

test("Treasury offer suggestions use purchase prices and only match the publication date", () => {
  assert.deepEqual(treasuryPurchaseReference(bond, "2026-10-21"), { price: "2100.25", rate: "7.23" });
  assert.equal(treasuryPurchaseReference(bond, "2025-03-27"), null);
  assert.equal(treasuryPurchaseReference(bond, "2026-10-22"), null);
  assert.equal(treasuryPurchaseReference({ ...bond, offered: false }, bond.quoteDate), null);
  assert.equal(treasuryPurchaseReference({ ...bond, purchasePrice: undefined }, bond.quoteDate), null);
  assert.equal(treasuryPurchaseReference({ ...bond, purchaseRate: NaN }, bond.quoteDate), null);
  assert.deepEqual(treasuryPurchaseReference({ ...bond, purchaseRate: 0 }, bond.quoteDate), { price: "2100.25", rate: "0" });
});

test("yield labels distinguish inflation spread, Selic spread and fixed annual yield", () => {
  assert.equal(treasuryYieldLabel("IPCA"), "Annual yield above IPCA (%)");
  assert.equal(treasuryYieldLabel("IGP-M"), "Annual yield above IGP-M (%)");
  assert.equal(treasuryYieldLabel("SELIC"), "Annual spread over Selic (%)");
  assert.equal(treasuryYieldLabel("prefixado"), "Fixed annual yield (%)");
});
