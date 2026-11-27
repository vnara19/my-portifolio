import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUnreadQuoteIssue } from "@/components/product/quote-issue-read";

test("inspecting a quote failure clears only that run's unread indicator", () => {
  assert.equal(hasUnreadQuoteIssue(true, "old", null, false), true);
  assert.equal(hasUnreadQuoteIssue(true, "old", null, true), false);
  assert.equal(hasUnreadQuoteIssue(true, "old", "old", false), false);
  assert.equal(hasUnreadQuoteIssue(true, "new", "old", false), true);
  assert.equal(hasUnreadQuoteIssue(false, "new", "old", false), false);
  assert.equal(hasUnreadQuoteIssue(true, null, "old", false), false);
});
