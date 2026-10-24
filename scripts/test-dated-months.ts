/** Manual integration test. Requires the disposable schema and fake account used by the local test workflow. */
import assert from "node:assert/strict";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { addPosition, undoChange } from "@/modules/portfolio/application/month-editing";
import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import { currentReferenceMonth, addMonths, toDateKey } from "@/modules/quotes/domain/calendar";
import { createVerifiedTickerToken } from "@/modules/quotes/application/verified-ticker-token";
import { marketIdentity } from "@/modules/portfolio/domain/market-assets";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "", /^english099_[a-f0-9]+$/);
  const db = getPrismaClient()!, original = globalThis.fetch;
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw)); assert.equal(url.hostname, "api.frankfurter.dev");
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    return Response.json({ date, base: url.pathname.includes("EUR") ? "EUR" : "USD", quote: "BRL", rate: url.pathname.includes("EUR") ? 6 : 5 });
  };
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: "cash-test@portfolio.invalid" } });
    await runAsUser(user.id, async () => {
      const currentDate = currentReferenceMonth(), oldDate = addMonths(currentDate, -2), middleDate = addMonths(currentDate, -1);
      const old = await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: oldDate, status: "REVIEWED" } });
      const current = await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: currentDate, status: "REVIEWED" } });
      const institution = await db.institution.create({ data: { userId: user.id, name: "Portfolio", normalizedName: "portfolio" } });
      const account = await db.account.create({ data: { userId: user.id, institutionId: institution.id, name: "Main" } });
      const asset = await db.asset.create({ data: { userId: user.id, name: "Apple", normalizedKey: "fake-aapl", assetType: "us-stock", quoteSymbol: "AAPL", ticker: "AAPL", baseCurrency: "USD" } });
      for (const [m, qty, opening, price] of [[old, "2", "2", "500"], [current, "5", "2", "700"]] as const) {
        const p = await db.position.create({ data: { userId: user.id, portfolioMonthId: m.id, accountId: account.id, assetId: asset.id, quantity: qty, openingQuantity: opening, unitPriceBrl: price, totalBrl: Number(qty) * Number(price) } });
        await db.positionAllocation.create({ data: { userId: user.id, positionId: p.id, assetClass: "Renda Variável", subclass: "Ações EUA", duration: "-", weight: "1" } });
        await db.marketQuote.createMany({ data: [{ referenceDate: m.referenceDate, symbol: "USD", instrumentType: "FIAT", baseCurrency: "USD", valueBrl: "5" }, { referenceDate: m.referenceDate, symbol: "AAPL", instrumentType: "ACAO", baseCurrency: "USD", valueBrl: price }] });
        if (m.id === current.id) await db.positionTransaction.create({ data: { userId: user.id, positionId: p.id, kind: "CONTRIBUTION", occurredOn: currentDate, quantity: "3", unitPriceBrl: "500", amountBrl: "1500" } });
      }
      await db.marketQuote.create({ data: { referenceDate: currentDate, symbol: "VOO", instrumentType: "ETF", baseCurrency: "USD", valueBrl: "700" } });
      const day = `${toDateKey(middleDate).slice(0, 7)}-15`;
      const buy = await addPosition({ monthId: current.id, addition: { accountId: account.id, assetId: asset.id, value: "2", strategy: null, allocations: [], purchase: { price: "100", commission: "0", currency: "USD", occurredOn: day } } });
      assert.equal(toDateKey(buy.referenceDate), toDateKey(middleDate));
      const middle = await db.portfolioMonth.findFirstOrThrow({ where: { userId: user.id, referenceDate: middleDate } });
      const read = (monthId: string) => db.position.findFirstOrThrow({ where: { userId: user.id, portfolioMonthId: monthId, assetId: asset.id } });
      assert.equal((await read(old.id)).quantity.toString(), "2"); assert.equal((await read(middle.id)).quantity.toString(), "4"); assert.equal((await read(current.id)).quantity.toString(), "7"); assert.equal((await read(current.id)).openingQuantity.toString(), "4");
      assert.equal(await db.positionTransaction.count({ where: { positionId: (await read(current.id)).id } }), 1);
      await undoChange(buy.undoToken); assert.equal((await read(middle.id)).quantity.toString(), "2"); assert.equal((await read(current.id)).quantity.toString(), "5");
      const identity = marketIdentity("us-market", "VOO", { name: "Vanguard S&P 500 ETF", currency: "USD", instrumentType: "ETF", exchange: "NYSE" });
      const token = createVerifiedTickerToken({ symbol: "VOO", kind: "us-market", status: "found", provider: "yahoo", priceBrl: 700, identity, coinId: null, quoteDate: new Date(), fetchedAt: new Date() }, { userId: user.id, monthId: current.id, now: new Date() });
      const fresh = await addPosition({ monthId: current.id, addition: { accountId: account.id, newAsset: { name: "Vanguard S&P 500 ETF", kind: "us-market", ticker: "VOO", maturityDate: null, manualPriceBrl: null, quoteCheckToken: token }, value: "2", strategy: null, allocations: [], purchase: { price: "100", commission: "0", currency: "USD", occurredOn: day } } });
      const voo = await db.asset.findFirstOrThrow({ where: { userId: user.id, quoteSymbol: "VOO" } });
      assert.equal((await db.position.findFirstOrThrow({ where: { assetId: voo.id, portfolioMonthId: middle.id } })).totalBrl.toString(), "1000");
      assert.equal((await db.position.findFirstOrThrow({ where: { assetId: voo.id, portfolioMonthId: current.id } })).totalBrl.toString(), "1400");
      await undoChange(fresh.undoToken); assert.equal(await db.asset.count({ where: { id: voo.id } }), 0);
      const today = new Date().toISOString().slice(0, 10);
      const routed = await addPosition({ monthId: middle.id, addition: { accountId: account.id, assetId: asset.id, value: "1", strategy: null, allocations: [], purchase: { price: "100", commission: "0", currency: "USD", occurredOn: today } } });
      assert.equal(toDateKey(routed.referenceDate), toDateKey(currentDate)); assert.equal((await read(current.id)).quantity.toString(), "6"); assert.equal((await read(middle.id)).quantity.toString(), "2"); await undoChange(routed.undoToken);
      const result = await ensureMonthsUpToDate(addMonths(currentDate, 1)); assert.equal(result.state, "created");
      const next = await db.portfolioMonth.findFirstOrThrow({ where: { userId: user.id, referenceDate: addMonths(currentDate, 1) } });
      assert.equal((await read(next.id)).quantity.toString(), "5"); assert.equal(next.status, "DRAFT");
      console.log("Date routing, missing-month creation, reviewed-month edits, forward quantities, later trades/prices, original proof scope, multi-month Undo and automatic month rollover passed.");
    });
  } finally { globalThis.fetch = original; await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
