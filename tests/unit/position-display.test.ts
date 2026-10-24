import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSecurityQuantity, nativePositionValue, valuationCurrency } from "@/modules/portfolio/presentation/position-display";
import { typeOf } from "@/modules/portfolio/presentation/position-filters";
import { englishLabel } from "@/lib/english-labels";

test("native holding values use the same monthly FX, never a missing-rate fallback", () => {
  const input = { assetType: "us-etf" as const, baseCurrency: "USD", totalBrl: 6000, quantity: 10, usdRate: 5, eurRate: 6 };
  assert.equal(nativePositionValue(input), 1200);
  assert.equal(nativePositionValue({ ...input, assetType: "eu-market", baseCurrency: "EUR" }), 1000);
  assert.equal(nativePositionValue({ ...input, assetType: "br-stock", baseCurrency: "BRL" }), 6000);
  assert.equal(nativePositionValue({ ...input, usdRate: null }), null);
  assert.equal(nativePositionValue({ ...input, usdRate: 0 }), null);
  assert.equal(nativePositionValue({ ...input, usdRate: Infinity }), null);
  assert.equal(nativePositionValue({ ...input, assetType: "international-bond", bondCost: 1490 }), 1490);
});
test("cash units are native balances, crypto units are not a fiat currency", () => {
  assert.equal(nativePositionValue({ assetType: "usd-balance", baseCurrency: "USD", quantity: 2000, totalBrl: 10000, usdRate: null, eurRate: null }), 2000);
  assert.equal(valuationCurrency("crypto", "BTC"), "USD");
  assert.equal(valuationCurrency("crypto", "Altcoins"), "USD");
  assert.equal(hasSecurityQuantity("usd-balance", "USD"), false);
  assert.equal(hasSecurityQuantity("pension", null), false);
  assert.equal(hasSecurityQuantity("fixed-income", null), false);
  assert.equal(hasSecurityQuantity("treasury", null), false);
  assert.equal(hasSecurityQuantity("treasury", "TD:123"), true);
  assert.equal(hasSecurityQuantity("us-etf", "VOO"), true);
  assert.equal(hasSecurityQuantity("crypto", "BTC"), true);
});
test("product type is independent of listing market and currency", () => {
  assert.equal(typeOf({ assetType: "us-stock" }), "Stock");
  assert.equal(typeOf({ assetType: "br-etf" }), "ETF");
  assert.equal(typeOf({ assetType: "eu-market", productType: "ETF" }), "ETF");
  assert.equal(typeOf({ assetType: "eu-market" }), "Unclassified Product");
  assert.equal(typeOf({ assetType: "eur-balance" }), "Cash");
  assert.equal(typeOf({ assetType: "crypto" }), "Cryptocurrency");
  assert.equal(englishLabel("Cripto"), "Cryptocurrency");
});
