
/** Email/password authentication with PostgreSQL sessions. Public registration creates an empty user account and requires a separate sign-in. */
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { consumeRateLimit } from "@/lib/rate-limit";
import { accountSecurity } from "./account-security";
import { getPrismaClient } from "@/lib/prisma";
import { allowedHosts, originOf } from "@/modules/auth/access";


import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, passwordPolicyError } from "./password-policy";
export { MIN_PASSWORD_LENGTH } from "./password-policy";

const signUpOverride = new AsyncLocalStorage<true>();


export function withSignUpOverride<T>(operation: () => Promise<T>) {
  return signUpOverride.run(true, operation);
}

function createAuth() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret || Buffer.byteLength(secret,"utf8")<32)throw new Error("Configure a strong authentication secret of at least 32 bytes.");
  const hosts = allowedHosts();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  return betterAuth({
    appName: "My Portfolio",
    secret,
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
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: false,
      onExistingUserSignUp: async () => {
        throw new APIError("UNPROCESSABLE_ENTITY", {
          message: "An account with this email already exists. Sign in instead.",
          code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (["/sign-up/email", "/sign-in/email"].includes(ctx.path) && typeof ctx.body?.email === "string") {
          ctx.body.email = ctx.body.email.trim().toLowerCase();
          if (!z.email().max(254).safeParse(ctx.body.email).success) {
            throw new APIError("BAD_REQUEST", { message: "Enter a valid email address.", code: "INVALID_EMAIL" });
          }
        }
        if (ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string") {
          const limit=await consumeRateLimit(ctx.body.email.trim().toLowerCase(),"account-login",10,60);
          if(!limit.allowed)throw new APIError("TOO_MANY_REQUESTS",{message:"Too many attempts. Please try again shortly."});
        }
        const password = ctx.path === "/sign-up/email" ? ctx.body?.password : ["/change-password", "/reset-password", "/set-password"].includes(ctx.path) ? ctx.body?.newPassword : undefined;
        if (typeof password === "string") {
          const error = passwordPolicyError(password);
          if (error) throw new APIError("BAD_REQUEST", { message: error, code: "PASSWORD_POLICY" });
        }
        if (ctx.path === "/sign-up/email" && typeof ctx.body?.email === "string") {
          const existing = await prisma.user.findFirst({
            where: { email: { equals: ctx.body.email, mode: "insensitive" } },
            select: { id: true },
          });
          if (existing) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: "An account with this email already exists. Sign in instead.",
              code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            });
          }
        }
      }),
    },
    user: { modelName: "user" },
    session: {
      modelName: "session",
      expiresIn: 24 * 60 * 60,
      updateAge: 60 * 60,


      cookieCache: { enabled: false },
    },
    account: { modelName: "authAccount" },
    verification: { modelName: "verification" },


    rateLimit: { enabled: true, storage: "database", modelName: "rateLimit", customRules: { "/sign-up/email": { window: 60, max: 10 } } },
    advanced: { database: { generateId: "uuid" }, defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" } },
    telemetry: { enabled: false },

    plugins: [accountSecurity(), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };


export function getAuth(): Auth {
  return (globalForAuth.auth ??= createAuth());
}
