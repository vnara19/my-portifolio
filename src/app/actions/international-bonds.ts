"use server";
import { MonthEditError } from "@/modules/portfolio/application/month-editing";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireMutationUser } from "@/modules/auth/session";
import { bondDay } from "@/modules/portfolio/domain/international-bond";
import type { EditActionResult } from "./edit-month";
const positive = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine((v) => Number(v) > 0 && Number(v) < 1e14);
const correctionSchema = z.object({ monthId: z.string().uuid(), transactionId: z.string().uuid(), date: bondDay, units: positive, totalPaid: positive, accruedPerBond: z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine(v => Number(v) < 1e14) });
export async function correctBondPurchaseAction(input: unknown): Promise<EditActionResult> {
  await requireMutationUser();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the purchase fields." };
  try {
    const { correctBondPurchase } = await import("@/modules/portfolio/application/international-bonds");
    const result = await correctBondPurchase(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, message: "Bond purchase corrected.", undoToken: result.undoToken };
  } catch (error) { unstable_rethrow(error); return { ok: false, message: error instanceof MonthEditError ? error.message : "Could not correct the bond purchase." }; }
}
