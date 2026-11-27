/** Password-confirmed email changes for the private workspace. No email is marked verified without proof. */
import { APIError, createAuthEndpoint, sensitiveSessionMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export function accountSecurity() {
  return {
    id: "account-security",
    endpoints: {
      updateAccountEmail: createAuthEndpoint("/account-email", {
        method: "POST",
        body: z.object({ newEmail: z.email().max(254), currentPassword: z.string().min(1).max(128) }),
        use: [sensitiveSessionMiddleware],
      }, async (ctx) => {
        const { user } = ctx.context.session;
        const credential = await ctx.context.internalAdapter.findCredentialAccount(user.id);
        if (!credential?.password || !await ctx.context.password.verify({ hash: credential.password, password: ctx.body.currentPassword })) {
          throw new APIError("BAD_REQUEST", { message: "The current password is incorrect." });
        }
        const email = ctx.body.newEmail.trim().toLowerCase();
        if (email === user.email.toLowerCase()) throw new APIError("BAD_REQUEST", { message: "Enter a different email address." });
        if (await ctx.context.internalAdapter.findUserByEmail(email)) throw new APIError("BAD_REQUEST", { message: "This email address cannot be used." });
        await ctx.context.internalAdapter.updateUser(user.id, { email, emailVerified: false });
        await ctx.context.internalAdapter.deleteUserSessions(user.id);
        deleteSessionCookie(ctx);
        return ctx.json({ status: true });
      }),
    },
    rateLimit: [{ pathMatcher: (path: string) => path === "/account-email", window: 60, max: 5 }],
  };
}
