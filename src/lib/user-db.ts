
/** All portfolio reads and writes are scoped to the verified user. CLI operations use an explicit runAsUser context. */
import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { requireSessionUser } from "@/modules/auth/session";


const OWNED_MODELS = new Set([
  "DataImport",
  "Institution",
  "Account",
  "Asset",
  "PortfolioMonth",
  "Position",
  "PositionAllocation",
  "PositionTransaction",
  "TargetPlan",
  "AllocationTarget",
  "ManualQuote",


  "FamilyContact",
  "FamilySeries",
  "FamilyEntry",


  "IncomeMonth",
  "IncomePayslip",

  "IncomeHourRecord",

  "OvertimeMonth",
  "OvertimeDay",
  "OvertimeRule",
  "OvertimePayment",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Args = { where?: object; data?: object | object[]; create?: object };


export const SCOPED_USER = "";

export function isOwnedModel(model: string) {
  return OWNED_MODELS.has(model);
}

function scope(operation: string, args: Args, userId: string): Args {
  const scoped: Args = { ...args };

  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...args.where, userId };
  } else if (operation === "create") {
    scoped.data = { ...args.data, userId };
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(args.data) ? args.data : [args.data ?? {}];
    scoped.data = rows.map((row) => ({ ...row, userId }));
  } else if (operation === "upsert") {
    scoped.where = { ...args.where, userId };
    scoped.create = { ...args.create, userId };
  } else {
    throw new Error(`Operation ${operation} without user scope.`);
  }

  return scoped;
}

const globalForScoped = globalThis as unknown as { scopedClients?: Map<string, PrismaClient> };
const scopedClients = (globalForScoped.scopedClients ??= new Map());


export function scopedPrisma(base: PrismaClient, userId: string): PrismaClient {
  const cached = scopedClients.get(userId);

  if (cached) {
    return cached;
  }

  const client = base.$extends({
    name: "user-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return OWNED_MODELS.has(model) ? query(scope(operation, args as Args, userId)) : query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  scopedClients.set(userId, client);
  return client;
}

const userContext = new AsyncLocalStorage<{ userId: string }>();


export function runAsUser<T>(userId: string, operation: () => Promise<T>) {
  return userContext.run({ userId }, operation);
}


export async function currentUserId() {
  return userContext.getStore()?.userId ?? (await requireSessionUser()).id;
}


export async function getUserDb(): Promise<PrismaClient | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  return scopedPrisma(prisma, await currentUserId());
}
