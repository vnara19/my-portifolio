
/** HMAC-signed ticker proofs are valid across processes. Verify expiry, request fields and signature before trusting provider results. */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ASSET_KINDS, type AssetKind, type QuoteProvider } from "@/modules/portfolio/domain/asset-kinds";
import { toDateKey } from "@/modules/quotes/domain/calendar";
import { marketIdentitySchema, type MarketIdentity } from "@/modules/portfolio/domain/market-assets";

export type VerifiedTicker = {
  identity?: MarketIdentity;
  symbol: string;
  kind: AssetKind;
  status: "found" | "unavailable";
  provider: QuoteProvider;
  priceBrl: number | null;
  coinId: string | null;
  quoteDate: Date;
  fetchedAt: Date;
  expiresAt: number;
};

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_PURPOSE = "portfolio:ticker-check:v1";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
});
const claimsSchema = z.object({
  identity: marketIdentitySchema.optional(),
  version: z.literal(1),
  userId: z.string().uuid(),
  monthId: z.string().uuid(),
  symbol: z.string().min(1).max(120),
  kind: z.enum(ASSET_KINDS),
  status: z.enum(["found", "unavailable"]),
  provider: z.enum(["awesome-api", "finnhub", "alpha-vantage", "coingecko", "yahoo", "tesouro"]),
  priceBrl: z.number().finite().positive().nullable(),
  coinId: z.string().min(1).max(120).nullable(),
  quoteDate: day,
  fetchedAt: z.iso.datetime(),
  expiresAt: z.number().int().positive(),
}).strict().refine((claims) => (claims.status === "found") === (claims.priceBrl !== null));

type Context = { userId: string; monthId: string; now?: Date };

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`${TOKEN_PURPOSE}\n${payload}`).digest();
}


export function createVerifiedTickerToken(
  entry: Omit<VerifiedTicker, "expiresAt">,
  context: Context,
  secret = process.env.BETTER_AUTH_SECRET,
): string {
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured.");
  const claims = claimsSchema.parse({
    ...entry,
    version: 1,
    userId: context.userId,
    monthId: context.monthId,
    quoteDate: toDateKey(entry.quoteDate),
    fetchedAt: entry.fetchedAt.toISOString(),
    expiresAt: (context.now ?? new Date()).getTime() + TOKEN_TTL_MS,
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export function readVerifiedTickerToken(
  token: string,
  context: Context,
  secret = process.env.BETTER_AUTH_SECRET,
): VerifiedTicker | null {
  if (!secret || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload, secret);
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const claims = parsed.data;
    if (
      claims.userId !== context.userId || claims.monthId !== context.monthId ||
      claims.expiresAt <= (context.now ?? new Date()).getTime()
    ) return null;
    return {
      ...(claims.identity ? { identity: claims.identity } : {}),
      symbol: claims.symbol,
      kind: claims.kind,
      status: claims.status,
      provider: claims.provider,
      priceBrl: claims.priceBrl,
      coinId: claims.coinId,
      quoteDate: new Date(`${claims.quoteDate}T00:00:00Z`),
      fetchedAt: new Date(claims.fetchedAt),
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}
