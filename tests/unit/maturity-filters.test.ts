import assert from "node:assert/strict";
import { test } from "node:test";
import { filterOptions, filterPositions } from "@/modules/portfolio/presentation/position-filters";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

const holding = (maturityDate: string | null = null): MonthPosition => ({
  id: "holding", accountId: "account", assetId: "asset", quoteSymbol: null, strategy: null, cashAccount: false, assetTypeInferred: false, quantity: 100, quantityText: "100", securityQuantity: null, nativeValue: 100, liquidated: false, unitPriceBrl: null, totalBrl: 100, totalUsd: 20, share: 100,
  assetType: "fixed-income", productType: "CDB", market: "Brazil", baseCurrency: "BRL", valueCurrency: "BRL", assetName: "Deposit", ticker: null, allocations: [], maturityDate,
});
const empty = { classes: [], subclasses: [], types: [], markets: [], currencies: [], maturities: [], search: "" };

test("maturity years come only from the selected portfolio's securities", () => {
  assert.deepEqual(filterOptions([]).maturities, []);
  const positions = [holding("2027-01-10"), holding("2027-11-30"), holding()];
  assert.deepEqual(filterOptions(positions).maturities, ["2027", "No Maturity Date"]);
  positions.push(holding("2051-03-15"));
  assert.deepEqual(filterOptions(positions).maturities, ["2027", "2051", "No Maturity Date"]);
  assert.deepEqual(filterPositions(positions, { ...empty, maturities: ["2051"] }), [positions[3]]);
  assert.equal(positions[3].maturityDate, "2051-03-15");
});
