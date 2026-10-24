import assert from "node:assert/strict";
import { test } from "node:test";
import { productType, listingMarket } from "@/modules/portfolio/presentation/asset-classification";
import { filterPositions, filterOptions } from "@/modules/portfolio/presentation/position-filters";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

test("contracts supply product type, while issuer and currency never imply trading market", () => {
  assert.equal(productType("fixed-income", "", "LCI"), "LCI");
  assert.equal(productType("international-bond", "", null, "Corporate"), "Corporate Bond");
  assert.equal(listingMarket("international-bond"), "Not Applicable / Not Specified");
  assert.equal(productType("eu-market", "EU_ETC"), "ETC");
  assert.equal(productType("eu-market", "EU_ETF"), "ETF");
});
test("product and market facets cascade without mixing geographic exposure or cash currencies", () => {
  const base = { allocations: [{ assetClass: "Renda Variável", subclass: "Ações - Ex: USA", duration: "-", weight: 100 }], assetName: "World ETF", ticker: "WORLD", valueCurrency: "EUR" };
  const positions = [
    { ...base, assetType: "eu-market", productType: "ETF", market: "Europe" },
    { ...base, assetType: "us-etf", productType: "ETF", market: "United States", valueCurrency: "USD" },
    { ...base, assetType: "eur-balance", productType: "Cash", market: "Not Applicable / Not Specified", allocations: [{ ...base.allocations[0], assetClass: "Caixa" }] },
  ] as MonthPosition[];
  const filters = { classes: [], subclasses: [], types: ["ETF"], markets: ["Europe"], currencies: [], maturities: [], liquidities: [], search: "" };
  assert.deepEqual(filterPositions(positions, filters), [positions[0]]);
  assert.deepEqual(filterOptions(positions, { ...filters, markets: [] }).markets, ["Europe", "United States"]);
  assert.deepEqual(filterOptions(positions, filters).currencies, ["EUR"]);
});
