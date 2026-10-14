import { describeQuoteSync, isQuoteSyncFailure } from "../../src/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "../../src/modules/quotes/application/sync-quotes";


//


const quoteSyncFunction = {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Use POST." }, { status: 405 });
    }

    const invocationId = request.headers.get("x-neon-trigger-invocation-id");

    if (!invocationId) {
      return Response.json({ error: "Only the Neon trigger can call this function." }, { status: 403 });
    }

    if (!process.env.PORTFOLIO_DATABASE_URL) {
      return Response.json({ error: "PORTFOLIO_DATABASE_URL is not configured." }, { status: 500 });
    }


    process.env.DATABASE_URL = process.env.PORTFOLIO_DATABASE_URL;

    const body = (await request.json().catch(() => null)) as { data?: { scheduled_at?: string } } | null;
    const scheduledAt = body?.data?.scheduled_at ?? null;
    const outcome = await syncQuotes();
    const lines = describeQuoteSync(outcome);

    for (const line of lines) {
      console.log(`[${scheduledAt ?? invocationId}] ${line}`);
    }

    return Response.json(
      { scheduledAt, state: outcome.state, lines },
      { status: isQuoteSyncFailure(outcome) ? 500 : 200 },
    );
  },
};

export default quoteSyncFunction;
