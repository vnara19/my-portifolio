import { expect, test } from "@playwright/test";
import { stubQuoteChecks } from "./support/quote-checks";

test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

test("settings preserves backups and account alongside tolerance", async ({ page }) => {
  await page.goto("/configuracao?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tolerance", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export backup" })).toBeVisible();
  for (const title of ["Asset class", "Currency", "Strategy", "Currency within each class", "Fixed income", "Equities", "Buy and sell preview"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  }
});

test("tolerance rejects invalid input and discard restores the saved value", async ({ page }) => {
  await page.goto("/configuracao");
  const input = page.getByRole("textbox", { name: "Tolerance in percentage points" });
  const saved = await input.inputValue();
  await input.fill("-1");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Save tolerance" })).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(input).toHaveValue(saved);
  await expect(page.getByRole("button", { name: "Save tolerance" })).toBeDisabled();
});
