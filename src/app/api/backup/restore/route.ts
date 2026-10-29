
/** Two-step restore: check validates without writing; apply replaces only the authenticated user's portfolio. A route avoids the Server Action upload-size limit. */
import { limitedJson, BodyLimitError } from "@/lib/request-body";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { BackupValidationError, previewBackup, restoreBackup } from "@/modules/backup/application/backup";
import type { BackupRestoreResponse } from "@/modules/backup/domain/backup-format";

export const dynamic = "force-dynamic";


export async function POST(request: Request) {
  const rejection = rejectForeignRequest(request);

  if (rejection) {
    return rejection;
  }

  const unauthorized = await rejectWithoutSession({bucket:"backup-restore",max:6});

  if (unauthorized) {
    return unauthorized;
  }

  let body: { mode?: unknown; backup?: unknown };

  try {
    body = (await limitedJson(request, 10 * 1024 * 1024)) as typeof body;
  } catch (error) {
    if(error instanceof BodyLimitError)return respond({state:"invalid",message:"The backup is too large or complex for web import. Use a smaller file or contact the application owner."},413);
    return invalid("The file is not valid JSON.");
  }

  if (body.mode !== "check" && body.mode !== "apply") {
    return invalid("The request is missing the restore mode.");
  }

  try {
    if (body.mode === "check") {
      const preview = await previewBackup(body.backup);
      return preview ? respond({ state: "checked", preview }) : unavailable();
    }

    const counts = await restoreBackup(body.backup);
    return counts ? respond({ state: "restored", counts }) : unavailable();
  } catch (error) {
    if (error instanceof BackupValidationError) {
      return invalid(error.message);
    }

    console.error("Backup restoration failed", { name: error instanceof Error ? error.name : "Unknown" });
    return respond(
      { state: "invalid", message: "Restoration failed and nothing was changed. Check that the file is complete." },
      500,
    );
  }
}

function respond(body: BackupRestoreResponse, status = 200) {
  return Response.json(body, { status });
}

function invalid(message: string) {
  return respond({ state: "invalid", message }, 400);
}

function unavailable() {
  return respond({ state: "invalid", message: "The database is unavailable." }, 503);
}
