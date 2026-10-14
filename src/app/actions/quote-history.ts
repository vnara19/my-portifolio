"use server";

import { z } from "zod";

import { requireSessionUser } from "@/modules/auth/session";
import { getRunHistory, type QuoteRunHistoryPage } from "@/modules/quotes/application/get-run-history";


export async function loadRunHistoryAction(month: unknown, before: unknown): Promise<QuoteRunHistoryPage | null> {
  await requireSessionUser();
  const parsed = z
    .object({ month: z.string().regex(/^\d{4}-\d{2}$/), before: z.string().datetime() })
    .safeParse({ month, before });
  return parsed.success
    ? getRunHistory(new Date(`${parsed.data.month}-01T00:00:00.000Z`), parsed.data.before)
    : null;
}
