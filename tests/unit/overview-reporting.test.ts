import assert from "node:assert/strict";
import { test } from "node:test";
import { portfolioGains } from "@/modules/portfolio/domain/portfolio-gains";
import { eurToUsdRate, expressEurGainsInUsd, expressEurMetricsInUsd } from "@/modules/portfolio/domain/overview-reporting";
import { benchmarkInEur } from "@/modules/portfolio/domain/benchmark-reporting";

test("the complete portfolio has one EUR result displayed equivalently in USD", () => {
  const reference = portfolioGains([
    { holding: "eur-etf", kind: "CONTRIBUTION", quantity: 10, amountBrl: 6000, usdRate: 6, transferId: null },
    { holding: "usd-bitcoin", kind: "CONTRIBUTION", quantity: 1, amountBrl: 3000, usdRate: 6, feeBrl: 30, transferId: null },
  ], [{ holding: "eur-etf", quantity: 10, valueUsd: 1200 }, { holding: "usd-bitcoin", quantity: 1, valueUsd: 700 }]);
  const displayed = expressEurGainsInUsd(reference, eurToUsdRate(6, 5));
  assert.equal(reference.unrealizedUsd, 405);
  assert.equal(displayed.unrealizedUsd, 486);
  assert.equal(displayed.realizedUsd, -6);
  assert.equal(displayed.totalUsd, 480);
  assert.equal(displayed.unrealizedPercent, reference.unrealizedPercent);
  assert.equal(displayed.realizedPercent, reference.realizedPercent);
  // A different current display rate changes amounts, not the underlying result or return.
  assert.equal(expressEurGainsInUsd(reference, 2).totalUsd, 800);
  assert.equal(expressEurGainsInUsd(reference, 2).unrealizedPercent, reference.unrealizedPercent);
});

test("daily, TWR and annualized metrics share the same reference basis", () => {
  const reference = { asOf: "2026-10-30", dailyUsd: -10, dailyPercent: -1, totalPercent: 20, annualizedPercent: 10 };
  const displayed = expressEurMetricsInUsd(reference, 1.2);
  assert.deepEqual(displayed, { ...reference, dailyUsd: -12 });
  for (const invalid of [null, 0, -1, NaN, Infinity]) {
    assert.equal(eurToUsdRate(6, invalid), null);
    assert.equal(expressEurGainsInUsd({ unrealizedUsd: 100, unrealizedPercent: 10, realizedUsd: 0, realizedPercent: 0, totalUsd: 100 }, invalid).totalUsd, null);
    assert.equal(expressEurMetricsInUsd(reference, invalid).dailyUsd, null);
  }
});

test("the benchmark is measured in the same EUR reference before calculating its return", () => {
  const index = [{ day: "2025-01-02", value: 100 }, { day: "2026-01-02", value: 110 }];
  const usd = index.map(p => ({ day: p.day, rate: 5 }));
  const eur = [{ day: "2025-01-02", rate: 6 }, { day: "2026-01-02", rate: 5.5 }];
  const converted = benchmarkInEur(index, usd, eur)!;
  assert.ok(Math.abs((converted[1].value / converted[0].value - 1) * 100 - 20) < 1e-10);
  assert.equal(benchmarkInEur(index, [], eur), null);
  assert.deepEqual(index.map(p => p.value), [100, 110]);
});
