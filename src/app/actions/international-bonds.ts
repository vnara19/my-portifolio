"use server";
import { MonthEditError } from "@/modules/portfolio/application/month-editing";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireMutationUser } from "@/modules/auth/session";
import { updateBond } from "@/modules/portfolio/application/international-bonds";
import { bondQuoteSchema, bondDay } from "@/modules/portfolio/domain/international-bond";
import type { EditActionResult } from "./edit-month";
const positive = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine((v) => Number(v) > 0 && Number(v) < 1e14);
const schema = z.object({ date: bondDay, marketValue: bondQuoteSchema.shape.marketValue.optional(), source: bondQuoteSchema.shape.source.optional(), monthId: z.string().uuid(), positionId: z.string().uuid(), coupon: positive.optional(), redeemedFace: positive.optional(), principalReceived: positive.optional() }).refine((v) => Boolean(v.redeemedFace) === Boolean(v.principalReceived));
export async function updateBondAction(input: unknown): Promise<EditActionResult> {
  await requireMutationUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the date and entered amounts." };
  try {
    const result = await updateBond(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, undoToken: result.undoToken, message: parsed.data.coupon || parsed.data.redeemedFace ? "Bond receipt recorded." : "Bond valuation updated." };
  } catch (error) { unstable_rethrow(error); return { ok: false, message: error instanceof MonthEditError ? error.message : "Could not update the bond." }; }
}
