import { expect, type Locator, type Page } from "@playwright/test";

import { waitForCompetenceHydration } from "./competence";


// Fill, inspect and cancel; do not save changes.


export async function waitForHydration(page: Page) {
  await waitForCompetenceHydration(page);
}

export async function hasOpenMonth(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
  await waitForHydration(page);
  return (await page.getByRole("button", { name: "Add position" }).count()) > 0;
}


export async function openEditableMonth(page: Page) {
  await page.goto("/posicoes");

  if (await hasOpenMonth(page)) {
    await page.waitForLoadState("networkidle");
    return true;
  }

  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  await page.goto(`/posicoes?mes=${previous}`);
  const open = await hasOpenMonth(page);
  await page.waitForLoadState("networkidle");
  return open;
}

export async function openAddForm(page: Page) {
  await page.getByRole("button", { name: "Add position" }).click();
  const dialog = page.getByRole("dialog", { name: "Add position" });
  await expect(dialog).toBeVisible();
  return dialog;
}

export function positionRow(page: Page, asset: string, institution?: string) {
  const rows = page.getByTestId("position-row").filter({ hasText: asset });
  return (institution ? rows.filter({ hasText: institution }) : rows).first();
}


export async function openPositionPage(page: Page, asset: string, institution?: string) {
  await waitForHydration(page);
  await positionRow(page, asset, institution).getByRole("link", { name: asset, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: asset })).toBeVisible({ timeout: 15_000 });
  await waitForHydration(page);
}

export async function openEditForm(page: Page, asset: string, institution?: string) {
  await openPositionPage(page, asset, institution);
  await page.getByRole("button", { name: "Edit position" }).click();
  const dialog = page.getByRole("dialog", { name: `Edit ${asset}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

export function formTab(dialog: Locator, name: "Overall" | "Asset" | "Allocation") {
  return dialog.getByRole("tab", { name: new RegExp(`^${name}`) });
}


export async function expectFormStep(dialog: Locator, label: string) {
  await expect(dialog.getByRole("list", { name: "Form steps" }).locator('li[aria-current="step"]')).toContainText(label);
}

export async function continueForm(dialog: Locator, next: "Asset" | "Allocation" | "Review") {
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, next);
}

export async function closeForm(dialog: Locator) {
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}


export function issueCount(dialog: Locator) {
  return dialog.locator("footer[data-issue-count]");
}

export async function pick(page: Page, field: Locator, text: string, option: string | RegExp) {
  await field.click();
  await page.keyboard.type(text);
  await page.getByRole("option", { name: option }).click();
}

export async function chooseKind(page: Page, dialog: Locator, kind: RegExp) {
  await dialog.getByRole("combobox", { name: /^(Asset type|Cash currency)$/ }).click();
  await page.getByRole("option", { name: kind }).click();
}
