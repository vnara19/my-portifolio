import { expect, test } from "@playwright/test";

import { continueForm, formTab, openAddForm, openEditableMonth, openEditForm } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("filters open with search and selection indicators", async ({ page, isMobile }) => {
  test.skip(isMobile, "No celular, os filtros ficam numa folha com chips (spec 077).");
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByText("21 of 21 positions")).toBeVisible();

  const filter = page.getByRole("combobox", { name: "Institution", exact: true });
  await filter.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const total = await page.getByRole("option").count();
  expect(total).toBeGreaterThan(1);

  await page.getByRole("combobox", { name: "Search Institution" }).fill("inte");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: "Inter" }).click();
  await expect(page.getByRole("option", { name: "Inter" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/inst=Inter/);
  await expect(page.getByRole("combobox", { name: /Institution 1 selected/ })).toBeVisible();


  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page).not.toHaveURL(/inst=/);
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(filter).toBeFocused();
  await expect(page.getByText("21 of 21 positions")).toBeVisible();
});

test("new-position pickers open on click and filter while typing", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "The latest and previous months are closed in the fixture data.");
  const dialog = await openAddForm(page);


  const kind = dialog.getByRole("combobox", { name: "Asset type" });
  await kind.click();
  await page.getByRole("option", { name: /Renda fixa/ }).click();
  const institution = dialog.getByRole("combobox", { name: "Institution" });
  await institution.click();
  await expect(institution).toHaveAttribute("aria-expanded", "true");
  expect(await page.getByRole("option").count()).toBeGreaterThan(5);
  await page.keyboard.type("c6");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(institution).toHaveValue("C6");
  await expect(institution).toHaveAttribute("aria-expanded", "false");


  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(institution).toHaveValue("");
  await expect(institution).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");


  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(institution).toHaveValue("C6");


  const strategy = dialog.getByRole("combobox", { name: "Strategy", exact: true });
  await expect(strategy).toHaveValue("No strategy");
  await strategy.click();
  await expect(page.getByRole("option", { name: "No strategy" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Core", exact: true }).click();
  await expect(strategy).toHaveValue("Core");
  await expect(strategy).toBeFocused();

  await expect(dialog.getByRole("textbox", { name: "Asset name" })).toHaveCount(0);
  await continueForm(dialog, "Asset");

  await expect(dialog.getByRole("combobox", { name: "Asset", exact: true })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("CDB Teste");


  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the strategy picker opens and Escape closes only the picker", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "The latest and previous months are closed in the fixture data.");

  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");
  const strategy = dialog.getByRole("combobox", { name: "Strategy", exact: true });

  await strategy.click();
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("option", { name: "Core-Satellite" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(strategy).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();


  await strategy.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(strategy).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(strategy).toHaveValue("Core-Satellite");

  await strategy.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("hed");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(strategy).toHaveValue("Hedge");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("allocation uses stable legacy taxonomy with class-dependent subclass and term", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "The latest and previous months are closed in the fixture data.");
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");
  await formTab(dialog, "Allocation").click();

  const assetClass = dialog.getByRole("combobox", { name: "Class of allocation 1", exact: true });
  const subclass = dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true });
  const redemption = dialog.getByRole("combobox", { name: "Redemption term of allocation 1", exact: true });
  await expect(assetClass).toHaveValue("Crypto");
  await assetClass.click();
  await expect(page.getByRole("option")).toHaveText(["Cash", "Crypto", "Fixed income", "Equities", "Reserve"]);
  await expect(page.getByRole("option", { name: "Crypto" })).toHaveAttribute("aria-selected", "true");


  await page.keyboard.type("Classe nova");
  await expect(page.getByRole("option", { name: /Usar/ })).toHaveCount(0);
  await expect(page.getByText("No option with this name")).toBeVisible();


  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(assetClass).toHaveValue("Crypto");


  await subclass.click();
  await expect(page.getByRole("option")).toHaveText(["BTC", "Altcoin", "Stablecoin"]);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Subclasse nova");
  await expect(page.getByRole("option", { name: /Usar/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(subclass).toHaveValue("BTC");
  await expect(redemption).toHaveValue("None");


  await assetClass.click();
  await page.getByRole("option", { name: "Fixed income", exact: true }).click();
  await expect(subclass).toHaveValue("");
  await expect(redemption).toHaveValue("");
  await subclass.click();
  await expect(page.getByRole("option")).toHaveText(["Floating-rate", "IPCA"]);
  await page.keyboard.press("Escape");
  await redemption.click();
  await expect(page.getByRole("option")).toHaveText(["Short-term", "Medium-term", "Long-term"]);
  await page.keyboard.press("Escape");


  await assetClass.click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  await expect(redemption).toHaveValue("Short-term");


  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
