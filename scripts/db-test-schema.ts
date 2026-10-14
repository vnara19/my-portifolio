import "dotenv/config";

import { execFileSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";


//


//   pnpm db:test-schema drop test_schema  deletes the isolated schema and its contents
//


const [command, name] = process.argv.slice(2);

function usage(): never {
  console.error("Usage: db:test-schema <create|url|drop> <name>");
  process.exit(1);
}

function schemaUrl(schema: string) {
  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function main() {
  if (!command || !name) {
    usage();
  }

  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(name) || name === "public") {
    throw new Error("Invalid name: use lowercase letters, numbers and _, and never public.");
  }

  const url = schemaUrl(name);

  if (command === "url") {
    console.info(url);
    return;
  }

  if (command === "create") {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
    });
    console.info(`Schema ${name} ready. Connection details remain private.`);
    return;
  }

  if (command === "drop") {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    await prisma.$disconnect();
    console.info(`Schema ${name} deleted.`);
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
