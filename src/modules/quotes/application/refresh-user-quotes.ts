import { getUserDb } from "@/lib/user-db";
import { currentReferenceMonth } from "../domain/calendar";
import { syncQuotes } from "./sync-quotes";

/** Only due public quotes used by the authenticated user's current holdings. No history backfill on navigation. */
export async function refreshUserQuotes(now = new Date()): Promise<boolean> {
  const db = await getUserDb();
  if (!db) return false;
  const positions = await db.position.findMany({
    where: { portfolioMonth: { referenceDate: currentReferenceMonth(now) }, quantity: { gt: 0 } },
    select: { asset: { select: { quoteSymbol: true } } },
  });
  const heldSymbols = positions.flatMap(p => p.asset.quoteSymbol ? [p.asset.quoteSymbol] : []);
  if (!positions.length) return false;
  const outcome = await syncQuotes({ now, symbols: [...new Set(["USD", "EUR", ...heldSymbols])], currentOnly: true });
  return outcome.state === "done" && outcome.succeeded.length > 0;
}
