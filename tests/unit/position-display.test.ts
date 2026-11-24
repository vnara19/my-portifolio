import assert from "node:assert/strict";
import { test } from "node:test";
import { positionTitle, maturityChartLabel, displayMaturityDate, overviewAssetLabel, showPositionTicker, hasSecurityQuantity, nativePositionValue, nativeUnitPrice, valuationCurrency } from "@/modules/portfolio/presentation/position-display";
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
  assert.equal(typeOf({ assetType: "eu-market" }), "");
  assert.equal(typeOf({ assetType: "eur-balance" }), "Cash Account");
  assert.equal(typeOf({ assetType: "crypto" }), "Cryptocurrency");
  assert.equal(englishLabel("Cripto"), "Cryptocurrency");
});

test("expanded unit prices use the same reporting currency and require that month's FX", () => {
  assert.ok(Math.abs(nativeUnitPrice(3572.8, "USD", 5, 6)! - 714.56) < 1e-9);
  assert.equal(nativeUnitPrice(600, "EUR", 5, 6), 100);
  assert.equal(nativeUnitPrice(600, "BRL", null, null), 600);
  assert.equal(nativeUnitPrice(600, "EUR", 5, null), null);
  assert.equal(nativeUnitPrice(600, "USD", 0, 6), null);
  assert.equal(nativeUnitPrice(600, "USD", Infinity, 6), null);
  assert.equal(nativeUnitPrice(null, "USD", 5, 6), null);
  assert.equal(nativeUnitPrice(Infinity, "USD", 5, 6), null);
});

test("technical Tesouro symbols are hidden from the asset subtitle",()=>{
 assert.equal(showPositionTicker("Tesouro Renda+ Aposentadoria Extra 2065","TD:TESOURO-RENDA-APOSENTADORIA-EXTRA:2084-12-15"),false);
});

test("Overview uses the Treasury asset name consistently instead of its provider key",()=>{
 const name="Tesouro Renda+ Aposentadoria Extra 2065";
 assert.equal(overviewAssetLabel(name,"TD:TESOURO-RENDA-APOSENTADORIA-EXTRA:2084-12-15"),name);
 assert.equal(overviewAssetLabel("ETF - UETW","UETW"),"UETW");
});

test("bank debt titles keep the issuer and rate while hiding generated dates", () => {
  assert.equal(positionTitle("CDB Mercantil 107.50% CDI · 2028-03-22 · 2026-01-22", null), "CDB Mercantil 107.5% CDI");
  assert.equal(positionTitle("LCI Example IPCA+6.00% · 2028-03-22 · 2026-01", null), "LCI Example IPCA+6%");
});

test("Treasury titles keep only the security name and year, preserving income-start years", () => {
  assert.equal(positionTitle("Tesouro Prefixado · 01/01/2032", "TD:TESOURO-PREFIXADO:2032-01-01"), "Tesouro Prefixado 2032");
  assert.equal(positionTitle("Tesouro IPCA+ · 2035-05-15", null), "Tesouro IPCA+ 2035");
  assert.equal(positionTitle("Tesouro Renda+ Aposentadoria Extra 2065", null), "Tesouro Renda+ Aposentadoria Extra 2065");
});

test("debt chart labels show the maturity year and only the maturity date is formatted for details", () => {
 const name="CDB BMG 15.33% · 2030-04-08 · 2025-04-07";
 assert.equal(positionTitle(name,null),"CDB BMG 15.33%");
 assert.equal(maturityChartLabel(name,null,"2030-04-08"),"CDB BMG 15.33% · 2030");
 assert.equal(maturityChartLabel("LCI Example 100% CDI · 2028-03-22 · 2026-01-01",null,"2028-03-22"),"LCI Example 100% CDI · 2028");
 assert.equal(displayMaturityDate("2030-04-08"),"08/04/2030");
 assert.equal(displayMaturityDate(null),null);
});
