import { z } from "zod";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { lookupBond } from "@/modules/portfolio/application/lookup-bond";
import { validBondIdentifier } from "@/modules/portfolio/domain/international-bond";
export const dynamic = "force-dynamic";
const schema = z.object({ identifier: z.string().trim().toUpperCase().refine(validBondIdentifier) });
export async function POST(request: Request) {
  const denied = rejectForeignRequest(request) ?? await rejectWithoutSession();
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Enter a valid ISIN or CUSIP." }, { status: 400 });
  return Response.json(await lookupBond(parsed.data.identifier), { headers: { "Cache-Control": "private, no-store" } });
}
