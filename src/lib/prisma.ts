
/** Scope the PostgreSQL adapter and search_path to the schema explicitly supplied in DATABASE_URL. */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};


export function databaseSchema(connectionString: string) {
  try {
    const schema = new URL(connectionString).searchParams.get("schema");
    return schema && schema !== "public" ? schema : null;
  } catch {
    return null;
  }
}

export function getPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  if (!globalForPrisma.prisma) {
    const schema = databaseSchema(connectionString);
    const adapter = schema
      ? new PrismaPg({ connectionString, options: `-c search_path="${schema}"` }, { schema })
      : new PrismaPg({ connectionString });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
