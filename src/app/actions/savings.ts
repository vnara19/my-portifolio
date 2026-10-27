"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireSessionUser } from "@/modules/auth/session";
import { createSavings, changeSavings } from "@/modules/portfolio/application/savings";
import { savingsSchema, savingsAmount, savingsBalance, savingsRateSchema } from "@/modules/portfolio/domain/savings";
import type { EditActionResult } from "./edit-month";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
const create = z.object({ name: z.string().trim().min(1).max(80), amount: savingsAmount, terms: savingsSchema });
const change = z.object({ assetId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["DEPOSIT", "WITHDRAWAL", "BALANCE", "RATE"]), amount: savingsBalance.optional(), lotId: z.string().uuid().optional(), rate: savingsRateSchema.optional() });
async function run(operation: () => Promise<{
    referenceDate: Date;
    undoToken: string;
}>): Promise<EditActionResult> { await requireSessionUser(); try {
    const result = await operation();
    revalidatePath("/");
    revalidatePath("/posicoes");
    revalidatePath("/posicoes/[accountId]/[assetId]", "page");
    return { ok: true, message: "Savings updated.", undoToken: result.undoToken, month: toMonthParam(result.referenceDate) };
}
catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: error instanceof z.ZodError ? "Review the Savings fields." : error instanceof Error ? error.message : "Savings could not be saved." };
} }
export async function createSavingsAction(input: unknown) { const parsed = create.safeParse(input); if (!parsed.success)
    return { ok: false as const, message: "Review the Savings fields." }; return run(() => createSavings(parsed.data)); }
export async function changeSavingsAction(input: unknown) { const parsed = change.safeParse(input); if (!parsed.success)
    return { ok: false as const, message: "Review the Savings fields." }; return run(() => changeSavings(parsed.data)); }
