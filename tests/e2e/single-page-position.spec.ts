import { expect, test } from "@playwright/test";
import { openAddForm, openEditableMonth, chooseKind, closeForm } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";

test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

test("new positions show all applicable fields without institution, strategy or a review step", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open reporting month.");
  const dialog = await openAddForm(page);
  await expect(dialog.getByRole("list", { name: "Form steps" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Institution", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Strategy", exact: true })).toHaveCount(0);
  await chooseKind(page, dialog, /^Fixed Income/);
  await dialog.getByRole("button", { name: "Asset", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Asset type", exact: true })).toHaveValue("Fixed Income");
  await expect(dialog.getByRole("combobox", { name: "Allocation class 1", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Asset name", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Balance (BRL)", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Add position", exact: true }).click();
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Enter the asset name");
  await closeForm(dialog);
});

test("cash selection uses the same form with cash asset types", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open reporting month.");
  const dialog = await openAddForm(page);
  await dialog.getByRole("button", { name: "Cash", exact: true }).click();
  await chooseKind(page, dialog, /^BRL Cash/);
  await expect(dialog.getByRole("textbox", { name: "Balance (BRL)", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Ticker", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add position", exact: true })).toBeVisible();
  await closeForm(dialog);
});

test("quoted assets use an automatic identity without manual allocation fields", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open reporting month.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /^US ETF/);
  await expect(dialog.getByRole("textbox", { name: "Asset name", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Allocation class 1", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Unclassified", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Asset", exact: true })).toHaveAttribute("aria-pressed", "true");
  await closeForm(dialog);
});
