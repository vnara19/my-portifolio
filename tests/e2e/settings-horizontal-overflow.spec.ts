import { expect, test } from "@playwright/test";
import { stubQuoteChecks } from "./support/quote-checks";

test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });
for (const width of [320, 360, 390, 430, 1440]) {
  test(`tolerance settings fits ${width}px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/configuracao");
    await expect(page.getByRole("textbox", { name: "Tolerance in percentage points" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  });
}
