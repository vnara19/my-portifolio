import assert from "node:assert/strict";
import { test } from "node:test";
import { usableHistoricalClose } from "@/modules/quotes/domain/history-errata";

test("currency-collision errata reject only the original bad observation, never a corrected price", () => {
  assert.equal(usableHistoricalClose("EGLN.L", "2025-10-24", 79.68769836425781), false);
  assert.equal(usableHistoricalClose("UETW.DE", "2025-10-24", 39.938499450683594), false);
  assert.equal(usableHistoricalClose("EGLN.L", "2025-10-24", 68.63), true);
  assert.equal(usableHistoricalClose("UETW.DE", "2025-10-24", 34.4), true);
  assert.equal(usableHistoricalClose("IGLN.L", "2025-10-24", 79.68769836425781), true);
  assert.equal(usableHistoricalClose("UETW.DE", "2025-10-23", 39.938499450683594), true);
});
