
/** Verify the server-side session before exposing user-scoped investment data. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/modules/auth/auth";

export type SessionUser = { id: string; name: string; email: string };


export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  } catch (error) {
    console.error("Could not read the session.", error);
    return null;
  }
});


export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/entrar");
  }

  return user;
}


export async function rejectWithoutSession(): Promise<Response | null> {
  return (await getSessionUser())
    ? null
    : Response.json({ message: "Sign in to continue." }, { status: 401 });
}
