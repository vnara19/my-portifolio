import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../src/generated/prisma/client";
import { brazilianNetValue } from "../../src/modules/portfolio/domain/brazilian-net-value";
import { positionTitle, showPositionTicker } from "../../src/modules/portfolio/presentation/position-display";
import { portfolioGains } from "../../src/modules/portfolio/domain/portfolio-gains";

test("CDB net value follows exact holding-period boundaries and IOF before IR", () => {
  const start = new Date("2024-01-01");
  for (const [days, net] of [[30,1077.5],[180,1077.5],[181,1080],[360,1080],[361,1082.5],[720,1082.5],[721,1085]]) {
    assert.equal(brazilianNetValue(new Prisma.Decimal(1100), new Prisma.Decimal(1000), start, new Date(+start + days * 86400000)).net.toNumber(), net);
  }
  const day1 = brazilianNetValue(new Prisma.Decimal(1100), new Prisma.Decimal(1000), start, new Date(+start + 86400000));
  assert.equal(day1.iof.toString(), "96");
  assert.equal(day1.ir.toString(), "0.9");
  assert.equal(day1.net.toString(), "1003.1");
  assert.equal(brazilianNetValue(new Prisma.Decimal(1100), new Prisma.Decimal(1000), start, start, true).net.toString(), "1100");
  assert.equal(brazilianNetValue(new Prisma.Decimal(900), new Prisma.Decimal(1000), start, start).net.toString(), "900");
});

test("maturity and reinvestment do not turn capital flows into a loss", () => {
  const movement = { holding: "old", kind: "CONTRIBUTION" as const, quantity: 1000, amountBrl: 1000, usdRate: 1, transferId: null };
  const result = portfolioGains([movement, { ...movement, kind: "WITHDRAWAL", amountBrl: 1100 }, { ...movement, holding: "new", amountBrl: 1100 }], [{ holding: "new", quantity: 1000, valueUsd: 1100 }]);
  assert.equal(result.totalUsd, 100);
  assert.equal(result.unrealizedUsd, 0);
  assert.equal(result.realizedUsd, 100);
});

test("generated ETF labels and their repeated ticker appear only once", () => {
  assert.equal(positionTitle("ETF - VOO", "VOO"), "VOO");
  assert.equal(showPositionTicker("ETF - VOO", "VOO"), false);
  assert.equal(showPositionTicker("Bitcoin", "BTC"), true);
  assert.equal(positionTitle("Vanguard S&P 500", "VOO"), "Vanguard S&P 500");
});
