import { getPrismaClient } from "@/lib/prisma";

export type DatabaseStatus = {
  state: "online" | "offline" | "not-configured";
  label: string;
  detail: string;
  latencyMs?: number;
};

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      state: "not-configured",
      label: "Not configured",
      detail: "Copy .env.example to .env and start PostgreSQL.",
    };
  }

  const startedAt = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      state: "online",
      label: "Connected",
      detail: "The database responded normally.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return {
      state: "offline",
      label: "Unavailable",
      detail: "Start the container with pnpm db:up and reload the page.",
    };
  }
}
