import { rejectWithoutSession } from "@/modules/auth/session";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { getTreasuryCatalog, TREASURY_SOURCE_URL } from "@/modules/quotes/domain/treasury";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { readTreasuryBook } from "@/modules/quotes/infrastructure/treasury";

export const dynamic = "force-dynamic";


export async function GET() {
  const unauthorized = await rejectWithoutSession();
  if (unauthorized) return unauthorized;

  try {
    const bonds = getTreasuryCatalog(await readTreasuryBook(), toDateKey(calendarDay(new Date())));
    return Response.json({ bonds, source: TREASURY_SOURCE_URL, valuation: "market" });
  } catch (error) {
    const described = describeProviderError(error);
    return Response.json({ bonds: [], code: described.code, message: `Could not load Tesouro Direto securities. ${described.message}` }, { status: 503 });
  }
}
