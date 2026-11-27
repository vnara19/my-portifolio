/** Isolated integration test for dated fixed-income maturity and Savings. */
import assert from "node:assert/strict";
import { getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { addPosition, removePosition, undoChange } from "@/modules/portfolio/application/month-editing";
import { applyMaturityExits, MATURITY_EXIT_NOTE } from "@/modules/portfolio/application/maturity-exits";
import { createSavings, changeSavings, refreshSavings } from "@/modules/portfolio/application/savings";
import { getPortfolioGains } from "@/modules/portfolio/application/get-portfolio-gains";
import { exportBackup, restoreBackup } from "@/modules/backup/application/backup";
import { calendarDay, currentReferenceMonth, toDateKey, addMonths } from "@/modules/quotes/domain/calendar";
import { type Savings } from "@/modules/portfolio/domain/savings";
import { isBusinessDay } from "@/modules/portfolio/domain/business-days";
import { randomUUID } from "node:crypto";
async function main() {
    assert.match(new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "", /^english099_[a-f0-9]+$/);
    const db = getPrismaClient()!;
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (raw) => { const url = new URL(String(raw)); assert.equal(url.hostname, "api.frankfurter.dev"); return Response.json({ date: url.searchParams.get("date"), base: url.pathname.includes("/EUR/") ? "EUR" : "USD", quote: "BRL", rate: url.pathname.includes("/EUR/") ? 6 : 5 }); };
    try {
        const user = await db.user.findUniqueOrThrow({ where: { email: "cash-test@portfolio.invalid" } });
        await runAsUser(user.id, async () => {
            const current = await db.portfolioMonth.findFirst({ where: { referenceDate: currentReferenceMonth() } }) ?? await db.portfolioMonth.create({ data: { userId: user.id, referenceDate: currentReferenceMonth(), status: "DRAFT" } });
            await assert.rejects(addPosition({ monthId: current.id, addition: { newAsset: { kind: "fixed-income", name: "No maturity", ticker: null, maturityDate: null, manualPriceBrl: null, quoteCheckToken: null, appliedOn: toDateKey(calendarDay(new Date())), fixedIncomeContract: { product: "CDB", issuer: "Test", indexer: "PRE", rate: "12", basis: "BUSINESS_252" } }, value: "1000", allocations: [], strategy: null } }), /maturity/);
            await assert.rejects(addPosition({ monthId: current.id, addition: { newAsset: { kind: "brl-cash", name: "Cash", ticker: null, maturityDate: null, manualPriceBrl: null, quoteCheckToken: null }, value: "1000", allocations: [], strategy: null } }), /Cash-only/);
            const start = toDateKey(new Date(Date.UTC(current.referenceDate.getUTCFullYear(), current.referenceDate.getUTCMonth() - 1, 25))), now = toDateKey(calendarDay(new Date()));
            const terms: Savings = { kind: "SAVINGS", currency: "EUR", country: "Ireland", product: "INSTANT", startDate: start, openingType: "DEPOSIT", rates: [{ date: start, grossRate: "2.5", quoteBasis: "PA", tierLimit: "2500", tierRate: "1", taxPercent: "33" }], events: [{ id: randomUUID(), date: start, kind: "DEPOSIT", amount: "5000" }] };
            const auditName = `Savings audit ${randomUUID().slice(0, 8)}`;
            const added = await createSavings({ name: auditName, amount: "5000", terms });
            const asset = await db.asset.findFirstOrThrow({ where: { name: auditName } });
            const row = () => db.position.findFirstOrThrow({ where: { assetId: asset.id, portfolioMonthId: current.id } });
            const initial = await row();
            assert.ok(initial.quantity.gt(5000));
            assert.equal(initial.totalBrl.toFixed(2), initial.quantity.mul(6).toFixed(2));
            assert.equal(await db.asset.count({ where: { assetType: { in: ["brl-cash", "usd-balance", "eur-balance"] } } }), 0);
            const gains = await getPortfolioGains(current.referenceDate, 5);
            assert.notEqual(gains.totalUsd, null);
            const withdrawal = await changeSavings({ assetId: asset.id, date: now, kind: "WITHDRAWAL", amount: "1000" });
            assert.equal((await row()).quantity.toFixed(2), initial.quantity.minus(1000).toFixed(2));
            const after = await getPortfolioGains(current.referenceDate, 5);
            assert.ok(Math.abs(after.totalUsd! - gains.totalUsd!) <= 0.02);
            await undoChange(withdrawal.undoToken);
            assert.equal((await row()).quantity.toString(), initial.quantity.toString());
            const back = await changeSavings({ assetId: asset.id, date: start.slice(0, 8) + "28", kind: "DEPOSIT", amount: "1000" });
            assert.ok((await row()).quantity.gt(initial.quantity.plus(1000)));
            await undoChange(back.undoToken);
            assert.equal((await row()).quantity.toString(), initial.quantity.toString());
            const count = await db.positionTransaction.count({ where: { position: { assetId: asset.id } } });
            await refreshSavings();
            await refreshSavings();
            assert.equal(await db.positionTransaction.count({ where: { position: { assetId: asset.id } } }), count);
            const removed = await removePosition({ monthId: current.id, positionId: (await row()).id });
            assert.equal((await row()).quantity.toString(), "0");
            assert.equal(await db.positionTransaction.count({ where: { position: { assetId: asset.id } } }), 0);
            await undoChange(removed.undoToken);
            assert.equal((await row()).quantity.toString(), initial.quantity.toString());
            const usdStart = toDateKey(new Date(Date.parse(now) - 2 * 86400000));
            const usdTerms: Savings = { ...terms, currency: "USD", product: "FLEXIBLE", startDate: usdStart, rates: [{ date: usdStart, grossRate: "3.26", netRate: "1.70" }], events: [{ id: randomUUID(), date: usdStart, kind: "DEPOSIT", amount: "1000" }] };
            const usdName = `USD audit ${randomUUID()}`;
            await assert.rejects(createSavings({ name: usdName, amount: "1000", terms: usdTerms }), /BRL CDI and EUR Instant Access only/);
            await assert.rejects(changeSavings({assetId:asset.id,date:now,kind:"RATE",rate:{date:now,grossRate:"99",quoteBasis:"PA"}}), /conditions are fixed/);
            const brStart = toDateKey(new Date(Date.parse(now) - 4 * 86400000));
            await db.rateCoverage.createMany({ data: [{ indexer: "CDI", fromDate: new Date(brStart), throughDate: new Date(now), fetchedAt: new Date() }], skipDuplicates: true });
            for (let d = new Date(brStart); d < new Date(now); d = new Date(+d + 86400000)) {
                if (isBusinessDay(toDateKey(d)))
                    await db.rateObservation.upsert({ where: { indexer_date: { indexer: "CDI", date: d } }, create: { indexer: "CDI", date: d, dailyPercent: "0.04", source: "test", fetchedAt: new Date() }, update: { dailyPercent: "0.04" } });
            }
            const brTerms: Savings = { ...terms, currency: "BRL", country: "Brazil", product: "CDI", startDate: brStart, rates: [{ date: brStart, grossRate: "100" }], events: [{ id: randomUUID(), date: brStart, kind: "DEPOSIT", amount: "10000" }] };
            const brName = `BRL audit ${randomUUID()}`;
            await createSavings({ name: brName, amount: "10000", terms: brTerms });
            const brAsset = await db.asset.findFirstOrThrow({ where: { name: brName } });
            const brRow = () => db.position.findFirstOrThrow({ where: { assetId: brAsset.id, portfolioMonthId: current.id } });
            const brBefore = await brRow();
            assert.ok(brBefore.totalBrl.gt(10000));
            const beforeBrGain = await getPortfolioGains(current.referenceDate, 5);
            await changeSavings({ assetId: brAsset.id, date: now, kind: "WITHDRAWAL", amount: "1000" });
            assert.equal((await brRow()).quantity.toFixed(2), brBefore.quantity.minus(1000).toFixed(2));
            const afterBrGain = await getPortfolioGains(current.referenceDate, 5);
            assert.notEqual(afterBrGain.totalUsd, null);
            assert.ok(Math.abs(afterBrGain.totalUsd! - beforeBrGain.totalUsd!) <= 0.02);
            const backup = await exportBackup();
            assert.ok(backup);
            await restoreBackup(backup);
            assert.equal((await row()).quantity.toString(), initial.quantity.toString());
            // A real fixed-income contract still exits at maturity without creating cash.
            const account = await db.account.findFirstOrThrow({ where: { name: "Main" } });
            const due = await db.asset.create({ data: { userId: user.id, name: "Maturing CDB", normalizedKey: `maturing-audit:${randomUUID()}`, assetType: "fixed-income", baseCurrency: "BRL", maturityDate: calendarDay(new Date()) } });
            const dueRow = await db.position.create({ data: { userId: user.id, portfolioMonthId: current.id, accountId: account.id, assetId: due.id, quantity: 1000, openingQuantity: 0, totalBrl: 1000 } });
            await db.positionTransaction.create({ data: { userId: user.id, positionId: dueRow.id, kind: "CONTRIBUTION", occurredOn: current.referenceDate, quantity: 1000, amountBrl: 1000 } });
            await applyMaturityExits();
            await applyMaturityExits();
            assert.equal((await db.position.findUniqueOrThrow({ where: { id: dueRow.id } })).quantity.toString(), "0");
            assert.equal(await db.positionTransaction.count({ where: { positionId: dueRow.id, note: MATURITY_EXIT_NOTE } }), 1);
            assert.ok(added.undoToken);
            assert.ok(addMonths(current.referenceDate, -1));
            console.log("Required FI maturity, no cash, tiered net Savings, native EUR/BRL values, neutral withdrawals, backdated deposits, multi-month Undo, idempotency, removal/restore and backup passed.");
        });
    }
    finally {
        globalThis.fetch = fetchOriginal;
        await db.$disconnect();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
