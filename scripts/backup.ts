import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../src/lib/prisma";
import { runAsUser } from "../src/lib/user-db";
import { exportBackup, previewBackup, restoreBackup } from "../src/modules/backup/application/backup";
import { BACKUP_TABLES, backupFileName } from "../src/modules/backup/domain/backup-format";


//

//   pnpm backup:restore --user <email> <file>           validates and shows the summary

//


function readArguments() {
  const args = process.argv.slice(2);
  const userIndex = args.indexOf("--user");
  const email = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const rest = args.filter((argument, index) => argument !== "--apply" && index !== userIndex && index !== userIndex + 1);
  return { command: rest[0], file: rest[1], email, apply: args.includes("--apply") };
}

async function main() {
  const { command, file, email, apply } = readArguments();
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!email) {
    throw new Error("Specify the user: --user <email> (pnpm auth:user list shows accounts).");
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });

  if (!user) {
    throw new Error(`No account exists with the email ${email}.`);
  }

  await runAsUser(user.id, () => run(command, file, apply));
}

async function run(command: string | undefined, file: string | undefined, apply: boolean) {

  if (command === "export") {
    const backup = await exportBackup();
    if (!backup) {
      throw new Error("DATABASE_URL is not configured.");
    }
    const target = file ?? path.join("backups", backupFileName(new Date(backup.exportedAt)));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(backup));
    console.info(
      `Backup saved to ${target}: ${BACKUP_TABLES.map(({ key }) => `${key} ${backup.tables[key].length}`).join(", ")}.`,
    );
  } else if (command === "restore" && file) {
    const input = JSON.parse(await readFile(file, "utf8")) as unknown;
    const preview = await previewBackup(input);
    if (!preview) {
      throw new Error("DATABASE_URL is not configured.");
    }
    console.info(`Backup for ${preview.exportedAt}, reporting months from ${preview.firstMonth} to ${preview.lastMonth}.`);
    for (const { key } of BACKUP_TABLES) {
      console.info(`  ${key}: ${preview.current[key]} today → ${preview.file[key]} in backup`);
    }
    if (!apply) {
      console.info("Dry run: nothing was saved. Run with --apply to restore.");
    } else {
      await restoreBackup(input);
      console.info("Restored.");
    }
  } else {
    console.error("Usage: backup:export --user <email> [file] | backup:restore --user <email> <file> [--apply]");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPrismaClient()?.$disconnect());
