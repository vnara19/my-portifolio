import assert from "node:assert/strict";
import { test } from "node:test";
import { runAsUser } from "@/lib/user-db";
import { addPosition, MonthEditError } from "@/modules/portfolio/application/month-editing";
import { marketIdentity } from "@/modules/portfolio/domain/market-assets";
import { createVerifiedTickerToken } from "@/modules/quotes/application/verified-ticker-token";

test("a verified quote cannot save an unclassified fund, even with forged client allocations", async () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "unit-test-only-fund-classification-proof";
  const userId = "a6d812eb-3a51-4f55-84df-0232092fcb56";
  const monthId = "a7b96ee8-e75e-497c-9fa2-4321f19b7cb0";
  const now = new Date();
  const identity = marketIdentity("eu-market", "UNKNOWN.DE", { name: "Unknown UCITS ETF", currency: "EUR", instrumentType: "ETF", exchange: "Xetra" });
  const token = createVerifiedTickerToken({ symbol: "UNKNOWN.DE", kind: "eu-market", identity, status: "found", provider: "yahoo", priceBrl: 250, coinId: null, quoteDate: now, fetchedAt: now }, { userId, monthId, now });
  try {
    await assert.rejects(runAsUser(userId, () => addPosition({ monthId, addition: {
      newAsset: { name: "Fake Equity", kind: "eu-market", ticker: "UNKNOWN.DE", maturityDate: null, quoteCheckToken: token, manualPriceBrl: null },
      value: "1", strategy: null, allocations: [{ assetClass: "Renda Variável", subclass: "Ações EUA", duration: "-", weightPercent: "100", ratePercent: null }],
    } })), (error: unknown) => error instanceof MonthEditError && error.message.includes("until its asset class has been identified"));
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});
