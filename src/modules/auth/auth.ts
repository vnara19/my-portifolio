
/** Email/password authentication with PostgreSQL sessions. Only allowlisted emails may sign up. CLI account creation can explicitly override the allowlist. */
import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { accountSecurity } from "./account-security";
import { getPrismaClient } from "@/lib/prisma";
import { allowedHosts, isSignUpAllowed, originOf } from "@/modules/auth/access";


export const MIN_PASSWORD_LENGTH = 10;

const signUpOverride = new AsyncLocalStorage<true>();


export function withSignUpOverride<T>(operation: () => Promise<T>) {
  return signUpOverride.run(true, operation);
}

function createAuth() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const hosts = allowedHosts();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  return betterAuth({
    appName: "My portfolio",
    database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
    baseURL: process.env.BETTER_AUTH_URL ?? {
      allowedHosts: hosts,
      fallback: productionHost ? `https://${productionHost}` : "http://localhost:3000",
      protocol: process.env.VERCEL ? "https" : "http",
    },
    trustedOrigins: hosts.map(originOf),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    user: { modelName: "user" },
    session: {
      modelName: "session",


      cookieCache: { enabled: false },
    },
    account: { modelName: "authAccount" },
    verification: { modelName: "verification" },


    rateLimit: { enabled: true, storage: "database", modelName: "rateLimit" },
    advanced: { database: { generateId: "uuid" } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!signUpOverride.getStore() && !isSignUpAllowed(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "This email is not allowed to create an account. Ask the application owner for access.",
              });
            }
            return { data: user };
          },
        },
      },
    },
    telemetry: { enabled: false },

    plugins: [accountSecurity(), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };


export function getAuth(): Auth {
  return (globalForAuth.auth ??= createAuth());
}
