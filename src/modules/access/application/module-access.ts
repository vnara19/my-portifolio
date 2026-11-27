import { notFound } from "next/navigation";
import { cache } from "react";

import type { PrismaClient } from "@/generated/prisma/client";
import type { AppModule, AppRole } from "@/generated/prisma/enums";
import { getPrismaClient } from "@/lib/prisma";
import { currentUserId } from "@/lib/user-db";
import { getSessionUser, requireSessionUser, type SessionUser } from "@/modules/auth/session";


export type UserAccess = { modules: AppModule[]; roles: AppRole[] };

const NO_ACCESS: UserAccess = { modules: [], roles: [] };

export class ModuleAccessError extends Error {
  constructor() {
    super("This area is unavailable for this user.");
  }
}


export async function readUserAccess(prisma: PrismaClient, userId: string): Promise<UserAccess> {
  const [modules, roles] = await Promise.all([
    prisma.moduleGrant.findMany({ where: { userId }, select: { module: true }, orderBy: { module: "asc" } }),
    prisma.roleGrant.findMany({ where: { userId }, select: { role: true }, orderBy: { role: "asc" } }),
  ]);

  return { modules: modules.map((grant) => grant.module), roles: roles.map((grant) => grant.role) };
}

const accessOf = cache(async (userId: string): Promise<UserAccess> => {
  const prisma = getPrismaClient();
  return prisma ? readUserAccess(prisma, userId) : NO_ACCESS;
});


export async function getSessionAccess(): Promise<{ user: SessionUser; access: UserAccess } | null> {
  const user = await getSessionUser();
  return user ? { user, access: await accessOf(user.id) } : null;
}


export async function requireModulePage(module: AppModule): Promise<SessionUser> {
  const user = await requireSessionUser();

  if (!(await accessOf(user.id)).modules.includes(module)) {
    notFound();
  }

  return user;
}


export async function assertModuleAccess(module: AppModule): Promise<string> {
  const prisma = getPrismaClient();
  const userId = await currentUserId();

  if (!prisma || !(await readUserAccess(prisma, userId)).modules.includes(module)) {
    throw new ModuleAccessError();
  }

  return userId;
}


export async function rejectWithoutModule(module: AppModule): Promise<Response | null> {
  const user = await getSessionUser();

  if (!user) {
    return Response.json({ message: "Sign in to continue." }, { status: 401 });
  }

  return (await accessOf(user.id)).modules.includes(module)
    ? null
    : Response.json({ message: "Page not found." }, { status: 404 });
}
