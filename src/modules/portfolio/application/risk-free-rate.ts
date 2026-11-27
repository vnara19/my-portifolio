import { requireSessionUser } from "@/modules/auth/session";
import { getPrismaClient } from "@/lib/prisma";

export async function getRiskFreeRate(): Promise<number | null> {
  const user = await requireSessionUser();
  const db = getPrismaClient();
  if (!db) return null;
  try {
    const saved = await db.user.findUnique({ where: { id: user.id }, select: { riskFreeRate: true } });
    return saved?.riskFreeRate.toNumber() ?? null;
  } catch { return null; }
}
