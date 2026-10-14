import { expect, test } from "@playwright/test";

import { chooseKind, closeForm, continueForm, openAddForm, openEditableMonth, pick } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });

test("the official catalog fills name and maturity and derives quantity from verified base price", async ({ page }) => {
  const bonds = [
    { symbol: "TD:TESOURO-IPCA:2032-08-15", providerId: "Tesouro IPCA+|2032-08-15", name: "Tesouro IPCA+ 2032", type: "Tesouro IPCA+", maturityDate: "2032-08-15", quoteDate: "2026-10-02", valueBrl: 2912.33 },
    { symbol: "TD:TESOURO-IPCA:2035-05-15", providerId: "Tesouro IPCA+|2035-05-15", name: "Tesouro IPCA+ 2035", type: "Tesouro IPCA+", maturityDate: "2035-05-15", quoteDate: "2026-10-02", valueBrl: 2311.05 },
  ];
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds, valuation: "market" } }));
  const checked: string[] = [];
  await page.route("**/api/quotes/ticker-check", async (route) => {
    const { ticker } = route.request().postDataJSON();
    checked.push(ticker);
    await route.fulfill({ json: { status: "found", symbol: ticker, provider: "tesouro", priceBrl: 2912.33, name: "Tesouro IPCA+ 2032", quoteDate: "2026-10-02", token: "treasury-test-token", coinId: "Tesouro IPCA+|2032-08-15" } });
  });
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Tesouro Direto/);
  await pick(page, dialog.getByRole("combobox", { name: "Institution" }), "inter", /^Inter$/);
  await continueForm(dialog, "Asset");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Tesouro Direto security" }).click();
  await page.getByRole("option", { name: /Tesouro IPCA\+ 2032/ }).click();
  await expect(dialog.getByText("Market price on 02/10/2026")).toBeVisible();
  await expect(dialog.getByText("Security maturity")).toBeVisible();
  await expect(dialog.getByText("15/08/2032")).toBeVisible();
  await expect.poll(() => checked.at(-1)).toBe("TD:TESOURO-IPCA:2032-08-15");
  await expect(dialog.getByRole("textbox", { name: "Asset name" })).toHaveValue("Tesouro IPCA+ 2032");
  await dialog.getByRole("textbox", { name: "Number of securities" }).fill("2");

  if (await dialog.getByText("Enter the bond price").count()) await dialog.getByRole("textbox", { name: "Security price" }).fill("2912,33");
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 5.824,66");
  await continueForm(dialog, "Allocation");

  await expect(dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true })).toHaveValue("IPCA");
  await dialog.getByRole("combobox", { name: "Redemption term of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "Long-term", exact: true }).click();
  await continueForm(dialog, "Review");
  await expect(dialog).toContainText("Tesouro IPCA+ 2032");
  await expect(dialog).toContainText("R$ 5.824,66");
  await expect(dialog).toContainText("15/08/2032");
  await closeForm(dialog);
});

test("Tesouro Direto accepts a BRL position value and a custom price", async ({ page }) => {
  const bond = { symbol: "TD:TESOURO-SELIC:2031-03-01", providerId: "Tesouro Selic|2031-03-01", name: "Tesouro Selic · 01/03/2031", type: "Tesouro Selic", maturityDate: "2031-03-01", quoteDate: "2026-10-02", valueBrl: 20000 };
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds: [bond], valuation: "market" } }));
  await page.route("**/api/quotes/ticker-check", (route) => route.fulfill({ json: { status: "found", symbol: bond.symbol, provider: "tesouro", priceBrl: 20000, name: bond.name, quoteDate: "2026-10-02", token: "treasury-test-token", coinId: bond.providerId } }));
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Tesouro Direto/);
  await pick(page, dialog.getByRole("combobox", { name: "Institution" }), "inter", /^Inter$/);
  await continueForm(dialog, "Asset");
  await dialog.getByRole("combobox", { name: "Tesouro Direto security" }).click();
  await page.getByRole("option", { name: /Tesouro Selic/ }).click();
  const price = dialog.getByRole("textbox", { name: "Security price" });


  await expect(price).toBeVisible();
  await dialog.getByRole("combobox", { name: "Enter the position using" }).click();
  await page.getByRole("option", { name: /Position value/ }).click();
  await dialog.getByRole("textbox", { name: "Position value (BRL)" }).fill("10000");
  if (await dialog.getByTestId("treasury-price-hint").count()) {

    await expect(dialog.getByTestId("treasury-price-hint")).toContainText("Official price: R$20,000.00");
    await expect(dialog.getByTestId("position-form-total")).toContainText("0.50 bonds");
    await price.fill("25000");
    await expect(dialog.getByTestId("treasury-price-hint")).toContainText("Uses your price");
  } else {
    await price.fill("25000");
  }
  await expect(dialog.getByTestId("position-form-total")).toContainText("0.40 bonds");
  await continueForm(dialog, "Allocation");
  await expect(dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true })).toHaveValue("Floating-rate");
  await dialog.getByRole("combobox", { name: "Redemption term of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "Short-term", exact: true }).click();
  await continueForm(dialog, "Review");
  await expect(dialog).toContainText("Entered price");
  await expect(dialog).toContainText("R$ 10.000,00");
  await closeForm(dialog);
});
