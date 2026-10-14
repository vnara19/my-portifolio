

import { z } from "zod";

import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { ASSET_KINDS } from "@/modules/portfolio/domain/asset-kinds";
import { checkTicker } from "@/modules/quotes/application/check-ticker";
import type { TickerCheckRequest, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

export const dynamic = "force-dynamic";

const requestSchema: z.ZodType<TickerCheckRequest> = z.object({
  monthId: z.string().uuid(),
  kind: z.enum(ASSET_KINDS),
  ticker: z.string().trim().min(1).max(120),
  coinId: z.string().trim().min(1).max(120).optional(),
});


// Recheck when the asset identity changes.
export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const unauthorized = await rejectWithoutSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    const body: TickerCheckResponse = { status: "invalid", message: "Enter a valid ticker for this asset type." };
    return Response.json(body, { status: 400 });
  }

  try {
    const body: TickerCheckResponse = await checkTicker(parsed.data);
    return Response.json(body);
  } catch {
    return Response.json({ message: "Could not verify the ticker right now." }, { status: 500 });
  }
}
