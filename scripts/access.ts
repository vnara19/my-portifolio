import "dotenv/config";

import type { AppModule, AppRole } from "../src/generated/prisma/enums";
import { getPrismaClient } from "../src/lib/prisma";
import { readUserAccess } from "../src/modules/access/application/module-access";


//
//   pnpm auth:access list
//   pnpm auth:access grant <e-mail> gastos-familiares | recebimentos | previdencia | admin
//   pnpm auth:access revoke <e-mail> gastos-familiares | recebimentos | previdencia | admin
//


const MODULES: Record<string, AppModule> = {
  "gastos-familiares": "FAMILY_EXPENSES",
  recebimentos: "INCOME",
  previdencia: "PENSION",
};
const ROLES: Record<string, AppRole> = { admin: "ADMIN" };

async function main() {
  const [command, email, name] = process.argv.slice(2);
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (command === "list") {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    for (const user of users) {
      const access = await readUserAccess(prisma, user.id);
      console.info(`${user.email}\tInvestments${access.modules.map((module) => `, ${module}`).join("")}${access.roles.length ? `\t[${access.roles.join(", ")}]` : ""}`);
    }
    return;
  }

  const area = name ? MODULES[name] : undefined;
  const role = name ? ROLES[name] : undefined;

  if ((command !== "grant" && command !== "revoke") || !email || (!area && !role)) {
    console.error("Usage: auth:access list | auth:access grant|revoke <e-mail> gastos-familiares|recebimentos|previdencia|admin");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });

  if (!user) {
    throw new Error(`No account exists with the email ${email}.`);
  }

  if (area) {
    if (command === "grant") {
      await prisma.moduleGrant.upsert({
        where: { userId_module: { userId: user.id, module: area } },
        create: { userId: user.id, module: area },
        update: {},
      });
    } else {
      await prisma.moduleGrant.deleteMany({ where: { userId: user.id, module: area } });
    }
  } else if (role) {
    if (command === "grant") {
      await prisma.roleGrant.upsert({
        where: { userId_role: { userId: user.id, role } },
        create: { userId: user.id, role },
        update: {},
      });
    } else {
      await prisma.roleGrant.deleteMany({ where: { userId: user.id, role } });
    }
  }

  console.info(`${command === "grant" ? "Granted" : "Revoked"}: ${name} for ${email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPrismaClient()?.$disconnect());
