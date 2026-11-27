
/** Read-only portfolio export. Cross-site navigation cannot trigger a download. */
import { rejectWithoutSession } from "@/modules/auth/session";
import { exportBackup } from "@/modules/backup/application/backup";
import { backupFileName } from "@/modules/backup/domain/backup-format";

export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ message: "Origin not allowed." }, { status: 403 });
  }

  const unauthorized = await rejectWithoutSession({bucket:"backup-export",max:12});

  if (unauthorized) {
    return unauthorized;
  }

  const backup = await exportBackup().catch(() => null);

  if (!backup) {
    return Response.json({ message: "Could not read the backup data." }, { status: 503 });
  }

  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${backupFileName(new Date(backup.exportedAt))}"`,
      "cache-control": "no-store",
    },
  });
}
