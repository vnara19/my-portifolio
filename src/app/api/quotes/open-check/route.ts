import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { runOpenChecks } from "@/modules/portfolio/application/open-checks";

export const dynamic = "force-dynamic";


export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const unauthorized = await rejectWithoutSession({bucket:"valuation-refresh",max:20});

  if (unauthorized) {
    return unauthorized;
  }

  return Response.json(await runOpenChecks());
}
