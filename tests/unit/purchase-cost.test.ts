import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { purchaseCost } from "@/modules/portfolio/domain/purchase-cost";
import { portfolioGains } from "@/modules/portfolio/domain/portfolio-gains";
import { automaticLiquidity } from "@/modules/portfolio/domain/liquidity";
import { preparePurchase } from "@/modules/portfolio/application/prepare-purchase";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("10.60 units retain fractional precision and EUR commission reduces USD unrealized gain", () => {
  const cost = purchaseCost("10.60", "100", "3", 6);
  assert.equal(cost.quantity.toString(), "10.6");
  assert.equal(purchaseCost("0.000000000001", "100", "0", 6).quantity.toFixed(), "0.000000000001");
  assert.equal(cost.nativeCost.toString(), "1063");
  assert.equal(cost.amountBrl.toString(), "6378");
  const gains = portfolioGains([{ holding: "fund", kind: "CONTRIBUTION", quantity: 10.6, amountBrl: cost.amountBrl.toNumber(), usdRate: 5, transferId: null }], [{ holding: "fund", quantity: 10.6, valueUsd: 1060 * 6 / 5 }]);
  assert.equal(gains.unrealizedUsd, -3.6);
  assert.equal(gains.realizedUsd, 0);
  assert.equal(gains.totalUsd, -3.6);
  assert.ok(Math.abs(gains.unrealizedPercent! - (-3 / 1063 * 100)) < 1e-8);
});
test("a partial sale carries acquisition commission through average cost", () => {
  const cost = purchaseCost("10", "100", "3", 6);
  const gains = portfolioGains([
    { holding: "fund", kind: "CONTRIBUTION", quantity: 10, amountBrl: cost.amountBrl.toNumber(), usdRate: 5, transferId: null },
    { holding: "fund", kind: "WITHDRAWAL", quantity: 5, amountBrl: 3300, usdRate: 5, transferId: null },
  ], [{ holding: "fund", quantity: 5, valueUsd: 660 }]);
  assert.equal(gains.unrealizedUsd, 58.2);
  assert.equal(gains.realizedUsd, 58.2);
});
test("invalid prices, fees and quantities cannot create acquisition cost", () => {
  for (const [quantity, price, fee] of [["0", "100", "3"], ["1", "-100", "3"], ["1", "100", "-3"], ["1", "100", "NaN"], ["0.0000000000001", "100", "0"]]) {
    assert.throws(() => purchaseCost(quantity, price, fee, 6));
  }
});
test("settlement defaults distinguish US, Europe, B3 bond ETFs and crypto", () => {
  assert.equal(automaticLiquidity("us-market"), "D+1");
  assert.equal(automaticLiquidity("eu-market", "equity", "2026-10-16"), "D+2");
  assert.equal(automaticLiquidity("eu-market", "equity", "2027-10-11"), "D+1");
  assert.equal(automaticLiquidity("br-market", "equity"), "D+2");
  assert.equal(automaticLiquidity("br-market", "bond"), "D+1");
  assert.equal(automaticLiquidity("crypto"), "24/7 · platform-dependent");
  assert.equal(automaticLiquidity("fixed-income"), null);
  assert.equal(automaticLiquidity("treasury"), null);
});
test("historical purchases use acquisition-date FX, not the current market quote", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    seen.push(url.searchParams.get("date")!);
    return Response.json({ date: "2026-10-09", base: url.pathname.includes("/EUR/") ? "EUR" : "USD", quote: "BRL", rate: url.pathname.includes("/EUR/") ? 6 : 5 });
  };
  const result = await preparePurchase({ price: "100", commission: "3", currency: "EUR", occurredOn: "2026-10-10" }, "10", "EUR", "2026-10-16");
  assert.deepEqual(seen, ["2026-10-10", "2026-10-10"]);
  assert.equal(result.cost.amountBrl.toNumber(), 6018);
  assert.match(result.note, /commission EUR 3/);
  await assert.rejects(preparePurchase({ price: "100", commission: "3", currency: "USD", occurredOn: "2026-10-10" }, "10", "EUR", "2026-10-16"), /currency/);
  await assert.rejects(preparePurchase({ price: "100", commission: "3", currency: "EUR", occurredOn: "2026-10-17" }, "10", "EUR", "2026-10-16"), /date/);
});

for (const [market, currency, fx] of [["US", "USD", 5], ["Brazil", "BRL", 1], ["Europe", "EUR", 6], ["Crypto", "USD", 5]] as const) {
  test(`${market} (${currency}): sale commission reduces realized profit and fractional partial sales retain average basis`, () => {
    const bought = purchaseCost("10.60", "100", "3", fx);
    const sold = purchaseCost("5.30", "120", "3", fx, "SELL");
    assert.equal(sold.nativeCost.toString(), "633");
    const gains = portfolioGains([
      { holding: market, kind: "CONTRIBUTION", quantity: 10.6, amountBrl: bought.amountBrl.toNumber(), usdRate: 5, transferId: null },
      { holding: market, kind: "WITHDRAWAL", quantity: 5.3, amountBrl: sold.amountBrl.toNumber(), usdRate: 5, transferId: null },
    ], [{ holding: market, quantity: 5.3, valueUsd: 636 * fx / 5 }]);
    assert.equal(gains.realizedUsd, 101.5 * fx / 5);
    assert.equal(gains.unrealizedUsd, 104.5 * fx / 5);
    const all = portfolioGains([
      { holding: market, kind: "CONTRIBUTION", quantity: 10.6, amountBrl: bought.amountBrl.toNumber(), usdRate: 5, transferId: null },
      { holding: market, kind: "WITHDRAWAL", quantity: 10.6, amountBrl: purchaseCost("10.6", "90", "3", fx, "SELL").amountBrl.toNumber(), usdRate: 5, transferId: null },
    ], []);
    assert.equal(all.unrealizedUsd, 0);
    assert.equal(all.realizedUsd, -112 * fx / 5);
  });
}
test("sale proceeds must exceed commission and execution amounts retain exact precision", () => {
  assert.throws(() => purchaseCost("1", "3", "3", 1, "SELL"), /Commission/);
  assert.throws(() => purchaseCost("1", "3", "4", 1, "SELL"), /Commission/);
  assert.equal(purchaseCost("0.00000001", "100000", "0", 5, "SELL").quantity.toString(), "1e-8");
});


test("Treasury statement principal preserves rounded unit-price differences and purchase costs", () => {
  const cost = purchaseCost("59.05", "170.56", "3", 1, "BUY", "10071.56");
  assert.equal(cost.amountBrl.toFixed(2), "10074.56");
  assert.equal(cost.unitPriceBrl.toString(), "170.56");
  assert.throws(() => purchaseCost("59.05", "170.56", "0", 1, "BUY", "9000"), /does not match/);
  assert.throws(() => purchaseCost("59.05", "170.56", "0", 1, "SELL", "10071.56"), /does not match/);
});
