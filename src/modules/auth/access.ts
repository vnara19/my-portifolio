
/** Build trusted origins from Vercel deployment hosts and explicit configuration. An empty signup allowlist denies registration. */


function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}


export function allowedSignUpEmails(env: Record<string, string | undefined> = process.env) {
  return new Set(list(env.AUTH_ALLOWED_EMAILS));
}

export function isSignUpAllowed(email: string, env: Record<string, string | undefined> = process.env) {
  return allowedSignUpEmails(env).has(email.trim().toLowerCase());
}


export function allowedHosts(env: Record<string, string | undefined> = process.env) {
  const hosts = new Set(list(env.AUTH_ALLOWED_HOSTS));

  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const host = env[key]?.trim().toLowerCase();
    if (host) {
      hosts.add(host);
    }
  }

  if (env.NODE_ENV !== "production" || !env.VERCEL) {
    hosts.add("localhost:3000");
    hosts.add("127.0.0.1:3000");
  }

  return [...hosts];
}

export function originOf(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? `http://${host}` : `https://${host}`;
}
