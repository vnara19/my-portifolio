import { expect, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("portfolio summary separates investment gains from balance changes", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  const summary = page.getByRole("region", { name: "Portfolio summary" });
  await expect(summary.locator("article")).toHaveCount(4);
  for (const label of ["Portfolio value", "Unrealized gain", "Realized gain", "Total gain"]) {
    await expect(summary.getByText(label, { exact: true })).toBeVisible();
  }
  for (const oldLabel of ["Monthly change", "12-month change", "All-time change", "Bitcoin (USD) this month"]) {
    await expect(summary.getByText(oldLabel, { exact: true })).toHaveCount(0);
  }
  const total = summary.locator("article").filter({ hasText: "Portfolio value" });
  await expect(total.locator('[data-currency="EUR"]')).toBeVisible();
  await expect(total.locator('[data-currency="BRL"]')).toBeVisible();
  await expect(summary.locator("article").filter({ hasNotText: "Portfolio value" }).locator("[data-currency]")).toHaveCount(0);
});

test("unavailable daily results, dividends and annualized returns explain missing data", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  const summary = page.getByRole("region", { name: "Portfolio summary" });
  await expect(summary.getByText("Last day — USD · —%")).toHaveAttribute("title", /previous-day valuation/);
  await expect(summary.getByText("Total dividends — USD")).toHaveAttribute("title", /not separately identified/);
  await expect(summary.getByText("Annualized yield —%")).toHaveAttribute("title", /XIRR/);
});

test("allocation shows current holdings without targets or trade recommendations", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  const allocation = page.getByRole("region", { name: "Allocation", exact: true });
  await expect(allocation.getByTestId("allocation-current")).toBeVisible();
  await expect(allocation.getByTestId("allocation-target")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Buy and sell" })).toHaveCount(0);
  await allocation.getByRole("button", { name: "Currency", exact: true }).click();
  await expect(allocation.getByRole("heading", { name: "Currency", exact: true })).toBeVisible();
  await expect(allocation.getByTestId("allocation-target")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`current allocation fits the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?mes=2026-09");
    const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
  });
}
