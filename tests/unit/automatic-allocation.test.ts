import assert from "node:assert/strict";
import { test } from "node:test";
import { automaticAllocation } from "@/modules/portfolio/domain/automatic-allocation";

test("ETF wrappers never imply equity exposure without fund metadata", () => {
  assert.deepEqual(automaticAllocation("us-etf", "BND"), []);
  assert.deepEqual(automaticAllocation("br-etf", "IMAB11.SAO"), []);
  assert.deepEqual(automaticAllocation("us-etf", "GLD"), []);
});
test("cryptocurrency and cash classify without fund exposure metadata", () => {
  assert.equal(automaticAllocation("crypto", "BTC")[0].assetClass, "Cripto");
  assert.equal(automaticAllocation("crypto", "USDC")[0].subclass, "Stablecoin");
  assert.equal(automaticAllocation("usd-balance", "USD")[0].assetClass, "Caixa");
});
test("fixed income does not invent indexation or maturity", () => {
  assert.deepEqual(automaticAllocation("fixed-income", null), []);
  assert.deepEqual(automaticAllocation("treasury", "TD:SELIC:2030-03-01"), []);
});
