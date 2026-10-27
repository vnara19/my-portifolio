import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";
import { isBusinessDay } from "./business-days";
import { brazilianNetValue } from "./brazilian-net-value";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && v >= "2000-01-01");
const rate = z.string().regex(/^\d+(\.\d{1,8})?$/).refine((v) => Number(v) <= 1000);
export const savingsRateSchema = z.object({ date: day, grossRate: rate, quoteBasis: z.enum(["PA", "AER"]).optional(), netRate: rate.optional(), tierLimit: z.string().max(40).regex(/^\d+(\.\d{1,2})?$/).refine(v => Number(v) <= 1e12).optional(), tierRate: rate.optional(), taxPercent: rate.optional() });
export const savingsEventSchema = z.object({ id: z.string().uuid(), date: day, kind: z.enum(["DEPOSIT", "WITHDRAWAL", "BALANCE"]), amount: rate.refine((v) => Number(v) > 0 && new Prisma.Decimal(v).decimalPlaces() <= 2), lotId: z.string().uuid().optional(), fx: z.string().optional() });
// Amounts, unlike percentages, can exceed 1,000.
export const savingsAmount = z.string().regex(/^\d+(\.\d{1,2})?$/).refine((v) => Number(v) > 0 && Number(v) <= 1e12);
export const savingsBalance = z.string().regex(/^\d+(\.\d{1,2})?$/).refine(v=>Number(v)<=1e12);
export const savingsSchema = z.object({ kind: z.literal("SAVINGS"), archived: z.boolean().optional(), currency: z.enum(["BRL", "USD", "EUR"]), country: z.string().trim().min(2).max(60), product: z.enum(["CDI", "INSTANT", "FLEXIBLE"]), startDate: day, openingType: z.enum(["DEPOSIT", "BALANCE"]), rates: z.array(savingsRateSchema).min(1).max(1000), events: z.array(savingsEventSchema.extend({ amount: savingsBalance })).min(1).max(10000) }).superRefine((s, ctx) => {
    if(s.events.some(e=>e.kind!=="BALANCE"&&Number(e.amount)<=0))ctx.addIssue({code:"custom",message:"Deposits and withdrawals must be positive."});
    if (s.product === "CDI" && (s.currency !== "BRL" || s.country !== "Brazil"))
        ctx.addIssue({ code: "custom", message: "CDI savings require BRL and Brazil." });
    if (s.product === "INSTANT" && (s.currency !== "EUR" || s.country !== "Ireland"))
        ctx.addIssue({ code: "custom", message: "Irish Instant Access Savings requires EUR." });
    if (s.product === "FLEXIBLE" && s.currency === "BRL")
        ctx.addIssue({ code: "custom", message: "Flexible Cash Funds supports EUR or USD." });
    if (s.rates.some((r) => r.date < s.startDate || (s.product === "FLEXIBLE" && (r.netRate === undefined || Number(r.netRate) > Number(r.grossRate))) || (r.taxPercent !== undefined && Number(r.taxPercent) > 100) || (s.product === "INSTANT" && !r.quoteBasis)))
        ctx.addIssue({ code: "custom", message: "Review the dated gross/net rates and withholding tax." });
    if (s.events.some((e) => e.date < s.startDate) || new Set(s.events.map(e => e.id)).size !== s.events.length || new Set(s.rates.map(r => r.date)).size !== s.rates.length || !s.rates.some(r => r.date === s.startDate))
        ctx.addIssue({ code: "custom", message: "Savings history must start at the opening date, without duplicate entries." });
});
export type Savings = z.infer<typeof savingsSchema>;
export function readSavings(value: unknown): Savings | null { const result = savingsSchema.safeParse(value); return result.success ? result.data : null; }
const D = Prisma.Decimal;
const next = (date: string) => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
const cents = (n: PrismaTypes.Decimal) => n.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
export type SavingsCalculation = {
    balance: string;
    automatic: boolean;
    lots: {
        id: string;
        date: string;
        net: string;
    }[];
    entries: {
        date: string;
        kind: "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";
        quantity: string;
        amount: string;
        sourceId?: string;
    }[];
};
/** Replay effective-dated instructions; no wallet, tax payment or inferred foreign tax. */
export function calculateSavings(s: Savings, asOf: string, cdi: Map<string, string> = new Map()): SavingsCalculation {
    if (s.archived)
        return { balance: "0.00", automatic: false, lots: [], entries: [] };
    let balance = new D(0), pendingGross = new D(0), pendingTax = new D(0), pendingNet = new D(0);
    const entries: SavingsCalculation["entries"] = [];
    const lots: {
        id: string;
        date: string;
        principal: PrismaTypes.Decimal;
        gross: PrismaTypes.Decimal;
    }[] = [];
    const automatic = !(s.product === "CDI" && s.openingType === "BALANCE");
    const netLot = (lot: typeof lots[number], date: string) => brazilianNetValue(lot.gross, lot.principal, new Date(lot.date), new Date(date)).net;
    const dailyIncome = new Map<string, SavingsCalculation["entries"][number]>();
    const income = (date: string, delta: PrismaTypes.Decimal, sourceId?: string) => { if (sourceId) {
        if (!delta.eq(0))
            entries.push({ date, kind: "INCOME", quantity: delta.abs().toFixed(2), amount: delta.toFixed(2), sourceId });
        return;
    } const existing = dailyIncome.get(date); const total = delta.plus(existing?.amount ?? 0); if (existing) {
        existing.quantity = total.abs().toFixed(2);
        existing.amount = total.toFixed(2);
    }
    else if (!total.eq(0)) {
        const entry = { date, kind: "INCOME" as const, quantity: total.abs().toFixed(2), amount: total.toFixed(2) };
        entries.push(entry);
        dailyIncome.set(date, entry);
    } };
    const orderedRates = [...s.rates].sort((a, b) => a.date.localeCompare(b.date));
    let rateIndex = 0;
    const eventsByDay = new Map<string, Savings["events"]>();
    for (const event of s.events)
        eventsByDay.set(event.date, [...(eventsByDay.get(event.date) ?? []), event]);
    for (let date = s.startDate; date <= asOf; date = next(date)) {
        while (rateIndex + 1 < orderedRates.length && orderedRates[rateIndex + 1].date <= date)
            rateIndex++;
        const terms = orderedRates[rateIndex];
        if (automatic && s.product === "CDI") {
            const valued = lots.reduce((sum, l) => sum.plus(netLot(l, date)), new D(0));
            income(date, valued.minus(balance));
            balance = valued;
        }
        else if (automatic && date !== s.startDate) {
            let paid: PrismaTypes.Decimal;
            if (s.product === "INSTANT") {
                const gross = cents(pendingGross);
                pendingGross = pendingGross.minus(gross);
                pendingTax = pendingTax.plus(gross.mul(terms.taxPercent ?? "33").div(100));
                const tax = cents(pendingTax);
                pendingTax = pendingTax.minus(tax);
                paid = gross.minus(tax);
            }
            else {
                paid = cents(pendingNet);
                pendingNet = pendingNet.minus(paid);
            }
            income(date, paid);
            balance = balance.plus(paid);
        }
        for (const event of eventsByDay.get(date) ?? []) {
            const amount = new D(event.amount);
            if (event.kind === "DEPOSIT") {
                balance = balance.plus(amount);
                lots.push({ id: event.id, date, principal: amount, gross: amount });
                entries.push({ date, kind: "CONTRIBUTION", quantity: amount.toFixed(2), amount: amount.toFixed(2), sourceId: event.id });
            }
            else if (event.kind === "BALANCE") {
                if(s.product === "CDI" && automatic){if(!amount.eq(0))throw new Error("Use dated withdrawals for known CDI deposits; only a confirmed zero balance can close the remainder.");for(const lot of lots){lot.gross=new D(0);lot.principal=new D(0);}}
                income(date, amount.minus(balance), event.id);
                balance = amount;
                pendingGross = new D(0);
                pendingTax = new D(0);
                pendingNet = new D(0);
            }
            else {
                if (amount.gt(balance))
                    throw new Error("The withdrawal exceeds the balance on this date.");
                if (automatic && s.product === "CDI") {
                    const available = lots.filter(l => netLot(l, date).gt(0));
                    const lot = event.lotId ? available.find(l => l.id === event.lotId) : available.length === 1 ? available[0] : null;
                    if (!lot)
                        throw new Error("Choose the original deposit being redeemed; no tax-lot order is assumed.");
                    const net = netLot(lot, date);
                    if (amount.gt(net))
                        throw new Error("The withdrawal exceeds this deposit's net balance.");
                    const fraction = amount.div(net);
                    lot.gross = lot.gross.mul(new D(1).minus(fraction));
                    lot.principal = lot.principal.mul(new D(1).minus(fraction));
                }
                balance = balance.minus(amount);
                entries.push({ date, kind: "WITHDRAWAL", quantity: amount.toFixed(2), amount: amount.toFixed(2), sourceId: event.id });
            }
        }
        if (date === asOf || !automatic)
            continue;
        if (s.product === "CDI") {
            if (isBusinessDay(date)) {
                const r = cdi.get(date);
                if (r === undefined)
                    throw new Error(`CDI is unavailable for ${date}. The known balance was preserved.`);
                const factor = new D(1).plus(new D(r).div(100).mul(new D(terms.grossRate).div(100)));
                for (const lot of lots)
                    lot.gross = lot.gross.mul(factor);
            }
        }
        else if (s.product === "INSTANT") {
            const year = Number(date.slice(0, 4));
            const days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
            const cap = terms.tierLimit ? new D(terms.tierLimit) : balance;
            const nominal = (value: string) => terms.quoteBasis === "AER" ? new D(1).plus(new D(value).div(100)).pow(new D(1).div(365)).minus(1).mul(36500) : new D(value);
            pendingGross = pendingGross.plus(D.min(balance, cap).mul(nominal(terms.grossRate)).plus(D.max(0, balance.minus(cap)).mul(nominal(terms.tierRate ?? terms.grossRate))).div(100 * days));
        }
        else
            pendingNet = pendingNet.plus(balance.mul(terms.netRate!).div(36500));
    }
    return { balance: balance.toFixed(2), automatic, lots: automatic && s.product === "CDI" ? lots.map(l => ({ id: l.id, date: l.date, net: netLot(l, asOf).toFixed(2) })) : [], entries: entries.filter(e => new D(e.quantity).gt(0)) };
}
