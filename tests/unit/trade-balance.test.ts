import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { tradeBalance } from "@/modules/portfolio/domain/trade-balance";
const units = (value: string) => new Prisma.Decimal(value);
const movement = (day: number, quantity: string, sale: boolean) => ({ date: new Date(Date.UTC(2026, 9, day)), quantity: units(quantity), sale });

test("a later purchase cannot fund a backdated sale", () => {
  assert.throws(() => tradeBalance(units("0"), [movement(19, "10.6", false), movement(18, "1", true)]), /exceeds/);
});
test("fractional sales consume carried opening units and same-day buys without rounding", () => {
  assert.equal(tradeBalance(units("0.000000000001"), [movement(19, "10.60", false), movement(19, "10.600000000001", true)]).toFixed(), "0");
});
test("a backdated buy is replayed before existing later sales and does not mutate input", () => {
  const entries = [movement(19, "4", true), movement(18, "10.6", false)];
  assert.equal(tradeBalance(units("0"), entries).toString(), "6.6");
  assert.equal(entries[0].sale, true);
});
test("an oversell is rejected even when a later purchase makes the final balance positive", () => {
  assert.throws(() => tradeBalance(units("5"), [movement(18, "6", true), movement(19, "10", false)]), /exceeds/);
});
