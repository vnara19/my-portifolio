import assert from "node:assert/strict";
import { test } from "node:test";
import { liquidityLabel } from "@/lib/liquidity-labels";
import { filterOptions, filterPositions } from "@/modules/portfolio/presentation/position-filters";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";

const holding = (liquidity: string | null, maturityDate: string | null = null): MonthPosition => ({
  id: "holding", accountId: "account", assetId: "asset", quoteSymbol: null, strategy: null, cashAccount: false, assetTypeInferred: false, quantity: 100, quantityText: "100", securityQuantity: null, nativeValue: 100, liquidated: false, unitPriceBrl: null, totalBrl: 100, totalUsd: 20, share: 100,
  assetType: "fixed-income", productType: "CDB", market: "Brazil", baseCurrency: "BRL", valueCurrency: "BRL", assetName: "Deposit", ticker: null, allocations: [], liquidity, maturityDate,
});
const empty = { classes: [], subclasses: [], types: [], markets: [], currencies: [], maturities: [], liquidities: [], search: "" };

test("liquidity aliases form one English option and match all legacy records", () => {
  const positions = [holding("Imediata"), holding("D+0"), holding("D+2"), holding("No vencimento"), holding(null), holding("D+30"), holding("D+1")];
  assert.deepEqual(filterOptions(positions).liquidities, ["Same Day", "D+1", "D+2", "D+30", "At Maturity", "Not Specified"]);
  assert.equal(filterPositions(positions, { ...empty, liquidities: ["Same Day"] }).length, 2);
  assert.equal(filterPositions(positions, { ...empty, liquidities: ["Imediata"] }).length, 2);
  assert.deepEqual(filterPositions(positions, { ...empty, liquidities: ["At Maturity"] }), [positions[3]]);
  assert.deepEqual(filterOptions(positions, { ...empty, liquidities: ["D+0", "Imediata"] }).liquidities, filterOptions(positions).liquidities);
  assert.equal(positions[0].liquidity, "Imediata");
  assert.equal(liquidityLabel("24/7 · platform-dependent"), "24/7 · platform-dependent");
});

test("maturity years come only from the selected portfolio's securities", () => {
  assert.deepEqual(filterOptions([]).maturities, []);
  const positions = [holding(null, "2027-01-10"), holding(null, "2027-11-30"), holding(null)];
  assert.deepEqual(filterOptions(positions).maturities, ["2027", "No Maturity Date"]);
  positions.push(holding(null, "2051-03-15"));
  assert.deepEqual(filterOptions(positions).maturities, ["2027", "2051", "No Maturity Date"]);
  assert.deepEqual(filterPositions(positions, { ...empty, maturities: ["2051"] }), [positions[3]]);
  assert.equal(positions[3].maturityDate, "2051-03-15");
});
