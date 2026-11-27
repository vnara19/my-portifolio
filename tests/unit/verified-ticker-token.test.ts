import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  createVerifiedTickerToken,
  readVerifiedTickerToken,
  type VerifiedTicker,
} from "@/modules/quotes/application/verified-ticker-token";

const secret = "ticker-test-only-secret-not-an-environment-credential";
const now = new Date("2026-10-04T12:00:00Z");
const context = { userId: "a6d812eb-3a51-4f55-84df-0232092fcb56", monthId: "a7b96ee8-e75e-497c-9fa2-4321f19b7cb0", now };
const entry: Omit<VerifiedTicker, "expiresAt"> = {
  symbol: "XRP", kind: "crypto", status: "found", provider: "coingecko",
  priceBrl: 17.12345678, coinId: "ripple",
  quoteDate: new Date("2026-10-04T00:00:00Z"), fetchedAt: now,
};

test("ticker proofs preserve price, dates and currency across server instances", () => {
  const token = createVerifiedTickerToken(entry, context, secret);
  const script = `
    import { readFileSync } from 'node:fs';
    import { readVerifiedTickerToken } from './src/modules/quotes/application/verified-ticker-token.ts';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const result = readVerifiedTickerToken(input.token, { ...input.context, now: new Date(input.context.now) }, input.secret);
    process.stdout.write(JSON.stringify(result));
  `;
  const value = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    input: JSON.stringify({ token, context, secret }), encoding: "utf8",
  }));
  assert.deepEqual(value, {
    ...entry, quoteDate: entry.quoteDate.toISOString(), fetchedAt: now.toISOString(),
    expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
  });
});

test("tampering, invalid signatures, wrong user/month and real expiry are rejected", () => {
  const token = createVerifiedTickerToken(entry, context, secret);
  const [payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const altered = Buffer.from(JSON.stringify({ ...claims, priceBrl: 0.01 })).toString("base64url");
  assert.equal(readVerifiedTickerToken(`${altered}.${signature}`, context, secret), null);
  assert.equal(readVerifiedTickerToken(token, context, `${secret}-other`), null);
  assert.equal(readVerifiedTickerToken(token, { ...context, userId: "d8ca1c54-2fe8-4c32-aaf3-e184a91bd899" }, secret), null);
  assert.equal(readVerifiedTickerToken(token, { ...context, monthId: "899c0fc1-ce9f-487b-904e-de9495a85790" }, secret), null);
  assert.equal(readVerifiedTickerToken(token, { ...context, now: new Date(now.getTime() + 2 * 60 * 60 * 1000) }, secret), null);
});

test("signed payloads still require version, positive finite prices and real dates", () => {
  const [payload] = createVerifiedTickerToken(entry, context, secret).split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  for (const patch of [
    { version: 2 }, { priceBrl: -1 }, { priceBrl: 0 }, { priceBrl: null },
    { priceBrl: "17" }, { quoteDate: "2026-02-30" }, { provider: "browser" },
    { fetchedAt: "invalid" }, { extra: "unexpected" },
  ]) {
    const altered = Buffer.from(JSON.stringify({ ...claims, ...patch })).toString("base64url");
    const signature = createHmac("sha256", secret).update(`portfolio:ticker-check:v1\n${altered}`).digest("base64url");
    assert.equal(readVerifiedTickerToken(`${altered}.${signature}`, context, secret), null, JSON.stringify(patch));
  }
  assert.throws(() => createVerifiedTickerToken({ ...entry, priceBrl: Number.POSITIVE_INFINITY }, context, secret));
});

test("provider outages preserve the manual option without inventing a price", () => {
  const token = createVerifiedTickerToken({ ...entry, status: "unavailable", priceBrl: null, coinId: null }, context, secret);
  const result = readVerifiedTickerToken(token, context, secret);
  assert.equal(result?.status, "unavailable");
  assert.equal(result?.priceBrl, null);
  assert.equal(readVerifiedTickerToken("legacy-uuid-token", context, secret), null);
  assert.equal(readVerifiedTickerToken("a.b.c", context, secret), null);
  assert.equal(readVerifiedTickerToken("a.b", context, secret), null);
  assert.equal(readVerifiedTickerToken("a".repeat(4097), context, secret), null);
});
