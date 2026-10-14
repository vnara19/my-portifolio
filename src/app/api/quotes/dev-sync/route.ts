
/** Reject production requests before accessing sessions, the database or providers. */
import { devToolsEnabled } from "@/lib/dev-tools";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { describeQuoteSync, isQuoteSyncFailure } from "@/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "@/modules/quotes/application/sync-quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {


  if (!devToolsEnabled()) {
    return Response.json({ message: "Route unavailable." }, { status: 404 });
  }
  const rejected = rejectForeignRequest(request) ?? await rejectWithoutSession();
  if (rejected) return rejected;
  try {
    const outcome = await syncQuotes();
    const ok = !isQuoteSyncFailure(outcome);
    return Response.json({ ok, state: outcome.state, lines: describeQuoteSync(outcome) }, { status: ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false, state: "unavailable", message: "The local update failed. Check the server terminal." }, { status: 500 });
  }
}
