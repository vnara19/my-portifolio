import assert from "node:assert/strict";
import { test } from "node:test";
import { productType, listingMarket } from "@/modules/portfolio/presentation/asset-classification";
import { filterPositions, filterOptions } from "@/modules/portfolio/presentation/position-filters";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

test("product types and reporting geography follow the chosen convention", () => {
  assert.equal(productType("fixed-income", "", "LCI"), "LCI");
  assert.equal(productType("international-bond", "", null, "Corporate"), "Corporate Bond");
  assert.equal(listingMarket("international-bond"), "Other Markets");
  assert.equal(productType("eu-market", "EU_ETC"), "ETC");
  assert.equal(productType("eu-market", "EU_ETF"), "ETF");
  assert.equal(productType("crypto", "", null, null, "BTC"), "Bitcoin");
  assert.equal(productType("crypto", "", null, null, "Stablecoin"), "Stablecoin");
  assert.equal(productType("treasury"), "Tesouro Direto");
  assert.equal(productType("pension"), "Pension Plan");
  assert.equal(productType("us-stock", "REIT"), "REIT");
  assert.equal(listingMarket("international-bond", "USD", "Ireland"), "Ireland");
  assert.equal(listingMarket("eur-balance", "EUR"), "Europe");
  assert.equal(listingMarket("crypto", "USD"), "Global");
});
test("product and market facets cascade without mixing geographic exposure or cash currencies", () => {
  const base = { allocations: [{ assetClass: "Renda Variável", subclass: "Ações - Ex: USA", duration: "-", weight: 100 }], assetName: "World ETF", ticker: "WORLD", valueCurrency: "EUR" };
  const positions = [
    { ...base, assetType: "eu-market", productType: "ETF", market: "Europe" },
    { ...base, assetType: "us-etf", productType: "ETF", market: "United States", valueCurrency: "USD" },
    { ...base, assetType: "eur-balance", productType: "Cash Account", market: "Europe", allocations: [{ ...base.allocations[0], assetClass: "Caixa" }] },
  ] as MonthPosition[];
  const filters = { classes: [], subclasses: [], types: ["ETF"], markets: ["Europe"], currencies: [], maturities: [], liquidities: [], search: "" };
  assert.deepEqual(filterPositions(positions, filters), [positions[0]]);
  assert.deepEqual(filterOptions(positions, { ...filters, markets: [] }).markets, ["Brazil", "Europe", "Global", "United States"]);
  assert.deepEqual(filterOptions(positions, filters).currencies, ["BRL", "EUR", "USD"]);
});
