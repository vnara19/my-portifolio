"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireMutationUser } from "@/modules/auth/session";
import { saveTargetPlan, saveTolerance, TargetPlanError } from "@/modules/portfolio/application/target-plan-editing";

const schema = z.object({
  targets: z
    .array(z.object({ key: z.string().min(1).max(200), percent: z.string().trim().min(1).max(20) }))
    .min(1)
    .max(200),
  tolerance: z.string().trim().min(1).max(20),
});

export type TargetPlanActionResult = { ok: boolean; message: string };

export async function saveTargetPlanAction(input: unknown): Promise<TargetPlanActionResult> {
  await requireMutationUser();
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

export async function saveToleranceAction(input: unknown): Promise<TargetPlanActionResult> {
  await requireMutationUser();
  if (typeof input !== "string" || input.length > 20) return { ok: false, message: "Review the tolerance value." };
  try {
    await saveTolerance(input.trim());
    revalidatePath("/configuracao");
    return { ok: true, message: "Tolerance saved." };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Tolerance save failed", { name: error instanceof Error ? error.name : "Unknown", code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined });
    return { ok: false, message: error instanceof TargetPlanError ? error.message : "Could not save tolerance." };
  }
}
