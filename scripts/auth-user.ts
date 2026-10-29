import "dotenv/config";

import { randomBytes } from "node:crypto";

import { passwordPolicyError } from "../src/modules/auth/password-policy";
import { getPrismaClient } from "../src/lib/prisma";
import { getAuth, withSignUpOverride } from "../src/modules/auth/auth";


//
//   pnpm auth:user list
//   pnpm auth:user create <email> <name>
//


async function main() {
  const [command, email, ...nameParts] = process.argv.slice(2);
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (command === "list") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true, createdAt: true },
    });
    for (const user of users) {
      console.info(`${user.email}\t${user.name}\t${user.createdAt.toISOString()}`);
    }
    if (users.length === 0) {
      console.info("No accounts.");
    }
  } else if (command === "create" && email && nameParts.length > 0) {
    const provided = process.env.AUTH_USER_PASSWORD;
    const password = provided ?? "Aa9!" + randomBytes(20).toString("base64url");

    const issue = passwordPolicyError(password);
    if (issue) throw new Error(issue);

    await withSignUpOverride(() =>
      getAuth().api.signUpEmail({ body: { email, password, name: nameParts.join(" ") } }),
    );
    console.info(`Account created: ${email}.`);
    if (!provided) {
      console.info(`Generated password (shown only once): ${password}`);
    }
  } else {
    console.error("Usage: auth:user list | auth:user create <email> <name>");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
