"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireSessionUser } from "@/modules/auth/session";
import { saveTargetPlan, TargetPlanError } from "@/modules/portfolio/application/target-plan-editing";

const schema = z.object({
  targets: z
    .array(z.object({ key: z.string().min(1).max(200), percent: z.string().trim().min(1).max(20) }))
    .min(1)
    .max(200),
  tolerance: z.string().trim().min(1).max(20),
});

export type TargetPlanActionResult = { ok: boolean; message: string };

export async function saveTargetPlanAction(input: unknown): Promise<TargetPlanActionResult> {
  await requireSessionUser();
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the entered percentages." };
  }

  try {
    await saveTargetPlan(parsed.data);
    revalidatePath("/");
    revalidatePath("/configuracao");
    return { ok: true, message: "Targets saved. They now apply to all analyses." };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      message: error instanceof TargetPlanError ? error.message : "Could not save the targets.",
    };
  }
}
