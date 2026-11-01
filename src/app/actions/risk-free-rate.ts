"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireMutationUser } from "@/modules/auth/session";
import { parseRiskFreeRate } from "@/modules/portfolio/domain/risk-free-rate";
import { getPrismaClient } from "@/lib/prisma";

export async function saveRiskFreeRateAction(input: unknown) {
  const user = await requireMutationUser();
  const parsed = parseRiskFreeRate(input);
  if (parsed === null)
    return { ok: false, message: "Use an annual rate from 0% to 100%, with at most two decimal places." };
  try {
    const db = getPrismaClient();
    if (!db) throw new Error("Database unavailable");
    await db.user.update({ where: { id: user.id }, data: { riskFreeRate: parsed } });
    revalidatePath("/");
    revalidatePath("/configuracao");
    return { ok: true, message: "Risk-Free Rate saved. Risk metrics have been recalculated." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "Could not save Risk-Free Rate. Please try again." };
  }
}
