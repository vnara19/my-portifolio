import { expect, test } from "@playwright/test";

const bond = {
  symbol: "TD:TESOURO-RENDA-APOSENTADORIA-EXTRA:2084-12-15",
  providerId: "Tesouro Renda+ Aposentadoria Extra|2084-12-15",
  name: "Tesouro Renda+ Aposentadoria Extra 2065",
  type: "Tesouro Renda+ Aposentadoria Extra",
  maturityDate: "2084-12-15", quoteDate: "2026-10-20", valueBrl: 220.82,
  purchasePrice: 232.58, purchaseRate: 6.66, indexer: "IPCA", targetYear: 2065,
  paymentType: "M", offered: true,
};

test("Treasury uses a closed official list and separates acquisition cost from redemption price", async ({ page }) => {
  await page.route("**/api/quotes/treasury-catalog", (route) => route.fulfill({ json: { bonds: [bond], valuation: "market" } }));
  await page.route("**/api/quotes/ticker-check", (route) => route.fulfill({ json: { status: "found", symbol: bond.symbol, provider: "tesouro", priceBrl: bond.valueBrl, name: bond.name, quoteDate: bond.quoteDate, token: "treasury-test-token", coinId: bond.providerId } }));
  await page.goto("/posicoes");
  const add = page.getByRole("button", { name: "Add position", exact: true });
  test.skip(!(await add.count()), "An open test month is required.");
  await add.click();
  await page.getByRole("combobox", { name: "Asset type", exact: true }).click();
  await page.getByRole("option", { name: /Tesouro Direto/ }).click();
  const dialog = page.getByRole("dialog");
  const security = dialog.getByRole("combobox", { name: "Tesouro Direto security", exact: true });
  await expect(security).toBeEnabled();
  await expect(security).toHaveAttribute("readonly", "");
  await security.click();
  await page.getByRole("option", { name: /2065/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Asset name", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Use official reference/ })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Commission", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Amount invested", exact: true })).toBeVisible();
  await expect(dialog.getByText("Fixed income", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Purchase price", exact: true }).fill("153.32");
  await dialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("81");
  await dialog.getByRole("textbox", { name: "Contracted annual rate", exact: true }).fill("7.23");
  await expect(dialog.getByTestId("purchase-total")).toContainText("12,418.92");
  await dialog.getByText("Security details", { exact: true }).click();
  await expect(dialog.getByText("2065", { exact: true })).toBeVisible();
  await expect(dialog.getByText("15/12/2084", { exact: true })).toBeVisible();
  await expect(dialog.getByText("R$220.82", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sell", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
