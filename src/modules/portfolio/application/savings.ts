import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { currentUserId, getUserDb, SCOPED_USER } from "@/lib/user-db";
import { calculateSavings, readSavings, savingsRegistration, savingsSchema, savingsAmount, savingsBalance, savingsRateSchema, type Savings } from "../domain/savings";
import { withUndo, MonthEditError } from "./month-editing";
import { ensureDatedMonth } from "./month-rollover";
import { primeFixedIncomeRates } from "./cdi-positions";
import { calendarDay, lastDayOf, toDateKey, currentReferenceMonth } from "@/modules/quotes/domain/calendar";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
const AUTO = "Savings automatic return";
type Tx = Prisma.TransactionClient;
const today = () => toDateKey(calendarDay(new Date()));
async function prepare(terms: Savings, date: string) {
    const db = (await getUserDb())!;
    if (date > today())
        throw new MonthEditError("Savings dates cannot be in the future.");
    if (terms.product === "CDI" && terms.openingType === "DEPOSIT")
        await primeFixedIncomeRates(db, "CDI", terms.startDate);
    const currencies = [...new Set(["USD", terms.currency].filter(c => c !== "BRL"))] as ("USD" | "EUR")[];
    for (const currency of currencies) {
        const point = await fetchReferenceFxLatest(currency, date);
        await db.dailyQuote.createMany({ data: [{ symbol: currency, quoteDate: new Date(point.day), instrumentType: "FIAT", baseCurrency: currency, valueBrl: point.value, provider: "frankfurter-ecb", fetchedAt: new Date() }], skipDuplicates: true });
    }
    const frames = await db.portfolioMonth.findMany({ where: { referenceDate: { gte: new Date(terms.startDate.slice(0, 7) + "-01") } }, select: { referenceDate: true } });
    for (const frame of frames) {
        const quotes = await readMonthQuoteValues(db, frame.referenceDate);
        for (const currency of currencies) {
            if (quotes.get(currency)?.valueBrl.gt(0))
                continue;
            const date = toDateKey(new Date(Math.min(+calendarDay(new Date()), +lastDayOf(frame.referenceDate))));
            const point = await fetchReferenceFxLatest(currency, date);
            await db.marketQuote.createMany({ data: [{ referenceDate: frame.referenceDate, symbol: currency, instrumentType: "FIAT", baseCurrency: currency, valueBrl: point.value, quoteDate: new Date(point.day) }], skipDuplicates: true });
        }
    }
}
async function rateOn(tx: Tx, currency: string, date: string) { if (currency === "BRL")
    return new Prisma.Decimal(1); const q = await tx.dailyQuote.findFirst({ where: { symbol: currency, quoteDate: { lte: new Date(date), gte: new Date(Date.parse(date) - 7 * 86400000) } }, orderBy: { quoteDate: "desc" }, select: { valueBrl: true } }); if (!q)
    throw new MonthEditError("Historical exchange rates are missing. The movement was not recorded."); return q.valueBrl; }
export async function savingsState(tx: Tx, terms: Savings, date: string) { const observations = terms.product === "CDI" && terms.openingType === "DEPOSIT" ? await tx.rateObservation.findMany({ where: { indexer: "CDI", date: { gte: new Date(terms.startDate), lte: new Date(date) } }, select: { date: true, dailyPercent: true } }) : []; try {
    return calculateSavings(terms, date, new Map(observations.map(r => [toDateKey(r.date), r.dailyPercent.toString()])));
}
catch (error) {
    throw new MonthEditError(error instanceof Error ? error.message : "Savings could not be calculated.");
} }
/** Generated returns are cache entries; user events and dated rate instructions remain the source of truth. */
export async function valueSavings(tx: Tx, assetId: string, fromMonth?: Date) {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
    const terms = readSavings(asset.fixedIncomeContract);
    if (!terms)
        return;
    const account = await tx.account.findFirstOrThrow({ where: { name: "Main", institution: { name: "Portfolio" } }, select: { id: true } });
    const frames = await tx.portfolioMonth.findMany({ where: { referenceDate: { gte: fromMonth ?? new Date(terms.startDate.slice(0, 7) + "-01"), lte: calendarDay(new Date()) } }, orderBy: { referenceDate: "asc" }, select: { id: true, referenceDate: true } });
    for (const frame of frames) {
        const end = toDateKey(new Date(Math.min(+calendarDay(new Date()), +lastDayOf(frame.referenceDate))));
        if (end < terms.startDate)
            continue;
        const state = await savingsState(tx, terms, end);
        const native = new Prisma.Decimal(state.balance);
        const quotes = await readMonthQuoteValues(tx, frame.referenceDate);
        const fx = terms.currency === "BRL" ? new Prisma.Decimal(1) : quotes.get(terms.currency)?.valueBrl;
        if (!fx)
            throw new MonthEditError(`The ${terms.currency} reporting exchange rate is unavailable.`);
        let row = await tx.position.findFirst({ where: { portfolioMonthId: frame.id, assetId, accountId: account.id } });
        const earlier = state.entries.filter(e => e.date < toDateKey(frame.referenceDate));
        const opening = earlier.reduce((sum, e) => sum.plus(e.kind === "WITHDRAWAL" || new Prisma.Decimal(e.amount).lt(0) ? new Prisma.Decimal(e.quantity).neg() : e.quantity), new Prisma.Decimal(0));
        const values = { quantity: native, totalBrl: native.mul(fx).toDecimalPlaces(2), openingQuantity: opening, exchangeRateBrl: fx, unitPriceBrl: null, calculationStartDate: null, calculatedIncomeBrl: new Prisma.Decimal(0), incomeCalculationError: null, incomeCalculatedThrough: new Date(end) };
        row = row ? await tx.position.update({ where: { id: row.id }, data: values }) : await tx.position.create({ data: { ...values, userId: SCOPED_USER, portfolioMonthId: frame.id, assetId, accountId: account.id } });
        if (!await tx.positionAllocation.findFirst({ where: { positionId: row.id }, select: { id: true } }))
            await tx.positionAllocation.create({ data: { userId: SCOPED_USER, positionId: row.id, assetClass: "Renda Fixa", subclass: terms.product === "CDI" ? "Pós-fixado" : "Savings", duration: "Curto", weight: 1 } });
        const entries = state.entries.filter(e => e.date >= toDateKey(frame.referenceDate));
        const existingEntries = await tx.positionTransaction.findMany({ where: { positionId: row.id }, select: { id: true, occurredOn: true, note: true, quantity: true, amountBrl: true, kind: true } });
        const byKey = new Map(existingEntries.map(e => [`${toDateKey(e.occurredOn)}:${e.note}`, e]));
        const keep: string[] = [];
        const fresh: Prisma.PositionTransactionCreateManyInput[] = [];
        for (const e of entries) {
            const note = e.sourceId ? `Savings ${e.kind.toLowerCase()}: ${terms.currency} ${e.amount}; event ${e.sourceId}` : AUTO;
            const existing = byKey.get(`${e.date}:${note}`);
            const eventFx = e.sourceId ? await rateOn(tx, terms.currency, e.date) : fx;
            const opening = terms.openingType === "BALANCE" && e.sourceId === terms.events[0]?.id;
            const data = { kind: opening ? "OPENING" as const : e.kind, occurredOn: new Date(e.date), quantity: e.quantity, amountBrl: new Prisma.Decimal(e.amount).mul(eventFx).toDecimalPlaces(2), unitPriceBrl: null, note };
            if (existing) {
                if (!existing.quantity.eq(e.quantity) || !existing.amountBrl.eq(data.amountBrl) || existing.kind !== data.kind)
                    await tx.positionTransaction.update({ where: { id: existing.id }, data });
                keep.push(existing.id);
            }
            else {
                const id = randomUUID();
                fresh.push({ ...data, id, userId: SCOPED_USER, positionId: row.id });
                keep.push(id);
            }
        }
        if (fresh.length)
            await tx.positionTransaction.createMany({ data: fresh });
        await tx.positionTransaction.deleteMany({ where: { positionId: row.id, id: { notIn: keep }, OR: [{ note: AUTO }, { note: { startsWith: "Savings " } }] } });
    }
}
export async function createSavings(input: {
    name: string;
    amount: string;
    terms: Savings;
}) {
    const terms = savingsRegistration(input.terms);
    const amount = savingsAmount.parse(input.amount);
    const name = input.name.trim();
    if (!name || name.length > 80)
        throw new MonthEditError("Enter a Savings name up to 80 characters.");
    if (terms.rates.length !== 1 || terms.rates[0].date !== terms.startDate || terms.events.length !== 1 || terms.events[0].kind !== "DEPOSIT" || terms.events[0].date !== terms.startDate || terms.events[0].amount !== amount)
        throw new MonthEditError("The opening deposit must match the entered amount and date.");
    const month = await ensureDatedMonth(terms.startDate);
    await prepare(terms, terms.startDate);
    return withUndo(month.id, async (tx) => {
        const created = { institutionIds: [] as string[], accountIds: [] as string[], assetIds: [] as string[], dailyQuoteIds: [] as string[] };
        let account = await tx.account.findFirst({ where: { name: "Main", institution: { name: "Portfolio" } }, select: { id: true } });
        if (!account) {
            let inst = await tx.institution.findFirst({ where: { normalizedName: "portfolio" }, select: { id: true } });
            if (!inst) {
                inst = await tx.institution.create({ data: { userId: SCOPED_USER, name: "Portfolio", normalizedName: "portfolio" } });
                created.institutionIds.push(inst.id);
            }
            account = await tx.account.create({ data: { userId: SCOPED_USER, institutionId: inst.id, name: "Main" } });
            created.accountIds.push(account.id);
        }
        const asset = await tx.asset.create({ data: { userId: SCOPED_USER, name, normalizedKey: `savings:${randomUUID()}`, assetType: "savings", baseCurrency: terms.currency, appliedOn: new Date(terms.startDate), autoIncome: false, liquidity: terms.product === "FLEXIBLE" ? "D+2" : "D+0", fixedIncomeContract: terms } });
        created.assetIds.push(asset.id);
        await valueSavings(tx, asset.id);
        return { created };
    }, { linkedMonths: true });
}
export async function changeSavings(input: {
    assetId: string;
    date: string;
    kind: "DEPOSIT" | "WITHDRAWAL" | "BALANCE" | "RATE";
    amount?: string;
    lotId?: string;
    rate?: Savings["rates"][number];
}) {
    const db = (await getUserDb())!;
    const owned = await db.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    const terms = readSavings(owned.fixedIncomeContract);
    if (!terms)
        throw new MonthEditError("This is not a Savings investment.");
    if (terms.archived)
        throw new MonthEditError("This Savings registration was removed. Restore it with Undo or create a new one.");
    if (input.date < terms.startDate || input.date > today())
        throw new MonthEditError("Choose an effective date within the Savings history.");
    if (terms.product === "INSTANT" && input.kind === "RATE")
        throw new MonthEditError("Instant Access conditions are fixed for this account.");
    const month = await ensureDatedMonth(input.date);
    await prepare(terms, input.date);
    return withUndo(month.id, async (tx) => {
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
        const current = readSavings(asset.fixedIncomeContract)!;
        const updated = savingsSchema.parse(input.kind === "RATE" ? { ...current, rates: [...current.rates.filter(r => r.date !== input.date), savingsRateSchema.parse({ ...input.rate, date: input.date })] } : { ...current, events: [...current.events, { id: randomUUID(), kind: input.kind, date: input.date, amount: (input.kind === "BALANCE" ? savingsBalance : savingsAmount).parse(input.amount), ...(input.lotId ? { lotId: input.lotId } : {}) }] });
        await tx.asset.update({ where: { id: asset.id }, data: { fixedIncomeContract: updated } });
        await valueSavings(tx, asset.id, month.referenceDate);
        return { assets: [{ ...asset, fixedIncomeContract: asset.fixedIncomeContract as Prisma.InputJsonValue, expectedFixedIncomeContract: updated }] };
    }, { linkedMonths: true });
}
export async function refreshSavings() { const db = await getUserDb(); if (!db)
    return; const assets = await db.asset.findMany({ where: { assetType: "savings" }, select: { id: true, fixedIncomeContract: true } }); if (!assets.length)
    return; for (const a of assets) {
    const terms = readSavings(a.fixedIncomeContract);
    if (terms && terms.product === "CDI" && terms.openingType === "DEPOSIT")
        await primeFixedIncomeRates(db, "CDI", terms.startDate);
} const user = await currentUserId(); await db.$transaction(async (tx) => { await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${user}),hashtext(${"portfolio-edits"}))`; for (const asset of assets) {
    try {
        await valueSavings(tx, asset.id, currentReferenceMonth());
    }
    catch (error) {
        if (!(error instanceof Error && error.message.startsWith("CDI is unavailable")))
            throw error;
        await tx.position.updateMany({ where: { assetId: asset.id, portfolioMonth: { referenceDate: currentReferenceMonth() } }, data: { incomeCalculationError: error.message } });
    }
} }, { maxWait: 10000, timeout: 60000 }); }
export async function removeSavings(assetId: string) { const db = (await getUserDb())!; const first = await db.position.findFirstOrThrow({ where: { assetId }, orderBy: { portfolioMonth: { referenceDate: "asc" } }, select: { portfolioMonthId: true } }); return withUndo(first.portfolioMonthId, async (tx) => { const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } }); const terms = readSavings(asset.fixedIncomeContract); if (!terms)
    throw new MonthEditError("This is not Savings."); const updated = { ...terms, archived: true }; await tx.asset.update({ where: { id: assetId }, data: { fixedIncomeContract: updated } }); await valueSavings(tx, assetId); return { assets: [{ ...asset, fixedIncomeContract: asset.fixedIncomeContract as Prisma.InputJsonValue, expectedFixedIncomeContract: updated }] }; }, { linkedMonths: true }); }
