import path from "node:path";


export const AUTH_STATE = path.join(process.cwd(), "playwright", ".auth", "user.json");

export function testUser() {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error("Set E2E_USER_EMAIL and E2E_USER_PASSWORD in .env (pnpm auth:user create creates the account).");
  }

  return { email, password };
}


export const SIGNED_OUT = { cookies: [], origins: [] };
