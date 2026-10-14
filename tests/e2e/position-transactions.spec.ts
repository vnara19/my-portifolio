import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeForm, expectFormStep, openAddForm, openEditableMonth, openPositionPage, positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

async function openMovement(page: Page, asset: string) {
  if (!(await page.getByRole("heading", { level: 1, name: asset, exact: true }).isVisible())) {
    await openPositionPage(page, asset);
  }
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Transactions ${asset}` });
  await expect(dialog).toBeVisible();
  await expectFormStep(dialog, "Transaction");
  return dialog;
}


const KIND_OPTIONS = { CONTRIBUTION: /^Aporte/, WITHDRAWAL: /^Retirada/, INCOME: /^Rendimento/ } as const;
const MODE_OPTIONS = { operation: "By transaction amount", total: "By new position total" } as const;

async function choose(dialog: Locator, field: string, option: string | RegExp) {
  await dialog.getByRole("combobox", { name: field }).click();
  await dialog.page().getByRole("option", { name: option }).click();
}

async function chooseMovement(dialog: Locator, kind: keyof typeof KIND_OPTIONS, mode: keyof typeof MODE_OPTIONS) {
  await choose(dialog, "Transaction type", KIND_OPTIONS[kind]);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Values");
  await choose(dialog, "Entry method", MODE_OPTIONS[mode]);
}

test("transactions require choosing a type and input mode before entering values", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openMovement(page, "ETF - VOO");
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Entry method" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Transaction quantity" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Registrar/ })).toHaveCount(0);
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await choose(dialog, "Transaction type", KIND_OPTIONS.CONTRIBUTION);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Values");
  await expect(dialog.getByRole("textbox", { name: "Transaction quantity" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Review transaction" })).toBeDisabled();
  await choose(dialog, "Entry method", MODE_OPTIONS.operation);
  await expect(dialog.getByRole("textbox", { name: "Transaction quantity" })).toBeVisible();
  await expect(dialog.getByTestId("transaction-preview")).toHaveCount(0);
  await closeForm(dialog);
});

test("two of quantity, price and amount compute the third; conflicts block review", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "CONTRIBUTION", "operation");
  const quantity = dialog.getByRole("textbox", { name: "Transaction quantity" });
  const price = dialog.getByRole("textbox", { name: "Execution price" });
  const amount = dialog.getByRole("textbox", { name: "Transaction amount" });
  await quantity.fill("2");
  await expect(dialog.getByText("monthly quote", { exact: true })).toBeVisible();
  await expect(amount).not.toHaveValue("");
  await price.fill("25");
  await expect(amount).toHaveValue("50");
  await quantity.fill("");
  await amount.fill("60");
  await expect(quantity).toHaveValue("2,4");
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/movement-values-iphone.png" });
  }
  await quantity.fill("3");
  await expect(dialog.getByTestId("transaction-issue")).toContainText("diferente do valor digitado");
  await expect(dialog.getByRole("button", { name: "Review transaction" })).toBeDisabled();
  await quantity.fill("");
  await dialog.getByRole("button", { name: "Review transaction" }).click();
  await expectFormStep(dialog, "Review");
  await expect(dialog.getByTestId("transaction-preview")).toContainText("+R$ 60,00");
  await expect(dialog.getByRole("button", { name: "Registrar aporte" })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: "Transaction date", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Transaction quantity" })).toHaveCount(0);
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/movement-review-iphone.png" });
  }
  await closeForm(dialog);
});

test("a lower new total computes a withdrawal and separates cash from market value", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "CONTRIBUTION", "total");
  await dialog.getByRole("textbox", { name: "New position total" }).fill("0,5");
  await expect(dialog.getByText(/will be recorded as a withdrawal/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Review transaction" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Review transaction" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("0,5 un.");
  await expect(dialog.getByRole("button", { name: "Registrar retirada" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Back" }).click();
  await choose(dialog, "New total in", "Market value (BRL)");
  await expect(dialog.getByText("New market value (BRL)")).toBeVisible();
  await closeForm(dialog);
});

test("manual balances accept returns and lower totals compute withdrawals", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const row = page.getByTestId("position-row").filter({ hasText: "BALANCE" }).first();
  test.skip((await row.count()) === 0, "No BRL balance in the open month.");
  const asset = (await row.getByRole("link").first().textContent())?.trim() ?? "";
  const dialog = await openMovement(page, asset);
  await chooseMovement(dialog, "CONTRIBUTION", "total");
  await expect(dialog.getByRole("textbox", { name: "Transaction quantity" })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "New position total" }).fill("1");
  await dialog.getByRole("button", { name: "Review transaction" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("R$ 1,00");
  await expect(dialog.getByRole("button", { name: "Registrar retirada" })).toBeEnabled();
  await closeForm(dialog);
  const income = await openMovement(page, asset);
  await chooseMovement(income, "INCOME", "operation");
  await income.getByRole("textbox", { name: "Transaction amount" }).fill("10");
  await income.getByRole("button", { name: "Review transaction" }).click();
  await expect(income.getByTestId("transaction-preview")).toContainText("+R$ 10,00");
  await expect(income.getByRole("button", { name: "Registrar rendimento" })).toBeEnabled();
  await closeForm(income);
});

test("dividends record cash returns without creating units", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openMovement(page, "ETF - VOO");
  await chooseMovement(dialog, "INCOME", "operation");
  await dialog.getByRole("textbox", { name: "Transaction amount" }).fill("10");
  await dialog.getByRole("button", { name: "Review transaction" }).click();
  await expect(dialog.getByTestId("transaction-preview")).toContainText("without units");
  await expect(dialog.getByRole("button", { name: "Registrar rendimento" })).toBeEnabled();
  await closeForm(dialog);
});

test("position creation does not require choosing opening balance versus contribution", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openAddForm(page);
  await expect(dialog.getByRole("radiogroup", { name: "Como o valor entra" })).toHaveCount(0);
  await expect(dialog.getByText("Opening balance", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Aporte agora", { exact: true })).toHaveCount(0);
  await closeForm(dialog);
});

test("position detail opens the same guided transaction flow", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  await positionRow(page, "ETF - VOO").getByRole("link", { name: "ETF - VOO" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ETF - VOO" })).toBeVisible();

  await expect(page.getByTestId("position-transactions-section")).toBeVisible();
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Movimentar ETF - VOO" });
  await expectFormStep(dialog, "Transaction");
  await closeForm(dialog);
});
