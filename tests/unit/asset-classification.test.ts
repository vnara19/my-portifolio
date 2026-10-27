import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCT_TYPES, productType, listingMarket } from "@/modules/portfolio/presentation/asset-classification";
import { defaultAllocation } from "@/modules/portfolio/domain/asset-kinds";
import { filterPositions, filterOptions, primaryClassOf } from "@/modules/portfolio/presentation/position-filters";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

test("product types and reporting geography follow the chosen convention", () => {
  assert.equal(productType("fixed-income", "", "LCI"), "LCI");
  assert.equal(productType("international-bond", "", null, "Corporate"), "Bonds");
  assert.equal(listingMarket("international-bond"), "Other Markets");
  assert.equal(productType("eu-market", "EU_ETC"), "");
  assert.equal(productType("eu-market", "EU_ETF"), "ETF");
  assert.equal(productType("crypto", "", null, null, "BTC"), "Bitcoin");
  assert.equal(productType("crypto", "", null, null, "Stablecoin"), "Stablecoin");
  assert.equal(productType("treasury"), "Tesouro Direto");
  assert.equal(productType("pension"), "Pension Plan");
  assert.equal(productType("us-stock", "REIT"), "REIT/FII");
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

test("the filter has exactly the user-approved registration products", () => {
  assert.deepEqual(new Set(filterOptions([]).types), new Set(["Stock", "REIT/FII", "ETF", "Savings", "CDB", "LCI", "LCA", "Bonds", "Tesouro Direto", "Cash Account", "Pension Plan", "Bitcoin", "Altcoin", "Stablecoin"]));
  assert.equal(productType("fixed-income", "", "CRI"), "");
  assert.equal(productType("fixed-income"), "");
  assert.equal(PRODUCT_TYPES.length, 14);
});

test("registration classifications map to the same filter keys", () => {
  for (const [symbol, expected] of [["BTC", "Bitcoin"], ["ETH", "Altcoin"], ["SOL", "Altcoin"], ["USDC", "Stablecoin"], ["USDT", "Stablecoin"]]) {
    const allocation = defaultAllocation("crypto", symbol);
    assert.equal(productType("crypto", "", null, null, allocation.subclass), expected);
  }
  for (const product of ["CDB", "LCI", "LCA"]) assert.equal(productType("fixed-income", "", product), product);
  for (const family of ["Sovereign", "Corporate", "Agency", "Municipal", "Supranational", "CD", "Covered", "Securitized", "Other"]) assert.equal(productType("international-bond", "", null, family), "Bonds");
  assert.equal(productType("br-stock", "FII"), "REIT/FII");
  assert.equal(productType("us-stock", "REIT"), "REIT/FII");
  assert.equal(productType("usd-balance", "", null, null, "Stablecoin"), "Stablecoin");
});

test("class markers use the largest historical allocation without changing saved weights", () => {
  const allocations = [
    { assetClass: "Renda Variável", subclass: "Ações BR", duration: "-", weight: 30 },
    { assetClass: "Renda Fixa", subclass: "Pós-fixado", duration: "Longo", weight: 70 },
  ];
  assert.equal(primaryClassOf({ allocations }), "Renda Fixa");
  assert.equal(allocations[0].weight, 30);
  assert.equal(primaryClassOf({ allocations: [] }), "Unclassified");
  assert.equal(primaryClassOf({ allocations: [allocations[1], allocations[0]] }), "Renda Fixa");
});
