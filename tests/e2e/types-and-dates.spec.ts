import { expect, test } from "@playwright/test";

import { expectFormStep, openEditableMonth, openPositionPage, waitForHydration } from "./support/position-form";
import { chooseFilter, openFilterGroup, usesFilterSheet } from "./support/position-filters";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("overview shows asset-type weights", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  const panel = page.getByTestId("asset-type-breakdown");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Asset type" })).toBeVisible();
  await expect(panel).toContainText("US ETF");
  await expect(panel).toContainText(/\d+,\d%/);
});

test("positions filter and group by asset type", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await waitForHydration(page);
  await chooseFilter(page, "Type", "US ETF", /tipo=ETF/);
  const rows = page.getByTestId("position-row");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) {
    expect(text).toContain("US ETF");
  }

  await page.goto("/posicoes?mes=2026-09&agrupar=tipo");
  await waitForHydration(page);

  const grouping = (await usesFilterSheet(page)) ? await openFilterGroup(page, "Group by") : page;
  await expect(grouping.getByRole("button", { name: "Type", exact: true, pressed: true })).toBeVisible();
});

test("transaction dates use the application calendar and stay inside the reporting month", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  await openPositionPage(page, "ETF - VOO");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Movimentar ETF - VOO" });
  await dialog.getByRole("combobox", { name: "Transaction type" }).click();
  await page.getByRole("option", { name: /^Aporte/ }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Entry method" }).click();
  await page.getByRole("option", { name: "By transaction amount" }).click();
  await dialog.getByRole("textbox", { name: "Transaction quantity" }).fill("1");
  await dialog.getByRole("button", { name: "Review transaction" }).click();
  await expectFormStep(dialog, "Review");

  const day = dialog.getByRole("textbox", { name: "Transaction date", exact: true });
  await expect(day).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);

  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);

  await dialog.getByRole("button", { name: "Open calendar: Transaction date" }).click();
  const calendar = page.getByRole("dialog", { name: "Calendar: Transaction date" });
  await expect(calendar).toBeVisible();
  await calendar.getByRole("button", { name: /, 1 de / }).first().click();
  await expect(calendar).toHaveCount(0);
  await expect(day).toHaveValue(/^01\/\d{2}\/\d{4}$/);


  await day.fill("");
  await day.pressSequentially("01011999");
  await expect(day).toHaveValue("01/01/1999");
  await expect(day).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});
