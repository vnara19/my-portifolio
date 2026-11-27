import "dotenv/config";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { addPosition } from "@/modules/portfolio/application/month-editing";
import { currentReferenceMonth } from "@/modules/quotes/domain/calendar";


const isolated = databaseSchema(process.env.DATABASE_URL ?? "") === "tx_adjustments_063";

test("XRP verification across processes saves the current price and defers history to the job", { skip: !isolated }, async () => {
  const prisma = getPrismaClient()!;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const referenceDate = currentReferenceMonth();
  let createdSymbol = false;
  try {

    assert.equal(await prisma.quoteSymbol.count({ where: { symbol: "XRP" } }), 0);
    await prisma.user.create({ data: { id: userId, name: "Ticker integration", email: `ticker-${userId}@example.test` } });
    await prisma.user.create({ data: { id: otherUserId, name: "Ticker isolation", email: `ticker-${otherUserId}@example.test` } });
    const month = await prisma.portfolioMonth.create({ data: { userId, referenceDate, status: "DRAFT" } });
    const institution = await prisma.institution.create({ data: { userId, name: "Ticker test", normalizedName: "ticker test" } });
    const account = await prisma.account.create({ data: { userId, institutionId: institution.id, name: "Main" } });
    const plan = await prisma.targetPlan.create({ data: { userId, name: "Ticker test" } });
    await prisma.allocationTarget.create({ data: {
      userId, planId: plan.id, key: "crypto", scope: "ASSET_CLASS", primaryLabel: "Criptomoedas", percentage: 1,
    } });


    const script = `
      import 'dotenv/config';
      import { readFileSync } from 'node:fs';
      import { getPrismaClient } from './src/lib/prisma.ts';
      import { runAsUser } from './src/lib/user-db.ts';
      import { checkTicker } from './src/modules/quotes/application/check-ticker.ts';
      const input = JSON.parse(readFileSync(0, 'utf8'));
      const calls = [];
      globalThis.fetch = async (url) => {
        const parsed = new URL(String(url));
        calls.push(parsed.pathname);
        if (parsed.pathname === '/api/v3/search') return Response.json({ coins: [{ id: 'ripple', symbol: 'XRP', name: 'XRP', market_cap_rank: 5 }] });
        if (parsed.pathname === '/api/v3/simple/price') return Response.json({ ripple: { brl: 17.12345678 } });
        throw new Error('Unexpected provider/history request: ' + parsed.pathname);
      };
      const result = await runAsUser(input.userId, () => checkTicker({ monthId: input.monthId, kind: 'crypto', ticker: 'XRP' }, { configuration: {} }));
      process.stdout.write(JSON.stringify({ result, calls }));
      await getPrismaClient().$disconnect();
    `;
    const checked = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      input: JSON.stringify({ userId, monthId: month.id }), encoding: "utf8",
    }));
    assert.equal(checked.result.status, "found");
    assert.deepEqual(checked.calls, ["/api/v3/search", "/api/v3/simple/price"]);
    assert.equal(await prisma.dailyQuote.count({ where: { symbol: "XRP" } }), 0);

    const addition = {
      accountId: account.id,
      newAsset: {
        name: "XRP", kind: "crypto" as const, ticker: "XRP", maturityDate: null,
        quoteCheckToken: checked.result.token, manualPriceBrl: null,
      },
      value: "10", strategy: null,
      allocations: [{ assetClass: "Criptomoedas", subclass: "Altcoins", duration: "Longo", weightPercent: "100" }],
    };
    await runAsUser(userId, () => addPosition({ monthId: month.id, addition }));
    createdSymbol = true;
    const position = await prisma.position.findFirstOrThrow({ where: { userId }, include: { asset: true } });
    assert.equal(position.totalBrl.toString(), "171.23");
    assert.equal(position.unitPriceBrl?.toString(), "17.12345678");
    assert.equal(position.asset.quoteProviderId, "ripple");
    const quote = await prisma.marketQuote.findFirstOrThrow({ where: { symbol: "XRP", referenceDate } });
    assert.equal(quote.valueBrl.toString(), "17.12345678");
    const registry = await prisma.quoteSymbol.findUniqueOrThrow({ where: { symbol: "XRP" } });
    assert.equal(registry.status, "PENDING");
    assert.equal(registry.providerId, "ripple");
    assert.equal(registry.historySyncedUntil, null);
    assert.equal(registry.historyAttemptedAt, null);
    assert.equal(await prisma.dailyQuote.count({ where: { symbol: "XRP", quoteDate: { lt: referenceDate } } }), 0);
    assert.equal(await prisma.dailyQuote.count({ where: { symbol: "XRP" } }), 1);
    assert.equal(await prisma.position.count({ where: { userId: otherUserId } }), 0);
  } finally {
    await prisma.position.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    if (createdSymbol && await prisma.asset.count({ where: { quoteSymbol: "XRP" } }) === 0) {
      await prisma.dailyQuote.deleteMany({ where: { symbol: "XRP" } });
      await prisma.marketQuote.deleteMany({ where: { symbol: "XRP" } });
      await prisma.quoteSymbol.deleteMany({ where: { symbol: "XRP" } });
    }
    await prisma.$disconnect();
  }
});
