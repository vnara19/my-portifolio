import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks, stubRun, stubSummary } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});


async function skipWithoutEditableQuote(page: Page) {
  const editable = await page.getByRole("button", { name: "Edit quotes" }).count();
  test.skip(editable === 0, "No editable quote in this reporting month's fixture data.");
}


async function enterQuoteEditMode(page: Page) {
  await page.getByRole("button", { name: "Edit quotes" }).click();
  await expect(page.locator('[data-quote-cell="value"]').first()).toBeVisible();
}

test("the Positions button opens monthly quotes", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();


  const icon = page.getByRole("link", { name: "Monthly quotes" });
  await expect(icon).toHaveCount(1);
  const topBar = page.locator("header").filter({
    has: page.getByRole("navigation", { name: "Main navigation" }),
  });
  await expect(topBar.getByRole("link", { name: "Portfolio settings" })).toBeVisible();
  await expect(topBar.getByRole("link", { name: "Monthly quotes" })).toHaveCount(0);
  await icon.click();
  await expect(page).toHaveURL(/\/posicoes\/cotacoes\?mes=2026-09$/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly quotes" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Positions" }),
  ).toHaveAttribute("aria-current", "page");

  await expect(page.getByRole("heading", { name: "Quotes for Sep/26" })).toBeVisible();
  const btc = page.getByTestId("quote-row").filter({ hasText: "BTC" });
  await expect(btc).toContainText("Bitcoin 01");
  await expect(btc).toContainText("R$");
  await expect(page.getByRole("region", { name: "Last update" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();

  await expect(page.getByTestId("run-history-count")).toContainText(/execuç(ão|ões) em Set\/26$/);
  await expect(page.locator("[data-quote-cell]")).toHaveCount(0);


  await expect(page.getByRole("button", { name: "Edit quotes" })).toHaveCount(0);
  await expect(page.getByTestId("quotes-locked")).toContainText("Manual editing is available only for");

  await page.getByRole("link", { name: "Back to Positions" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
});

test("returning with unsaved quote edits requires confirmation", async ({ page }) => {
  await page.goto("/posicoes/cotacoes");
  await skipWithoutEditableQuote(page);
  await enterQuoteEditMode(page);
  const field = page.locator('[data-quote-cell="value"]').first();
  await field.fill("400000,5");
  await expect(page.getByText("1 pending change")).toBeVisible();

  const back = page.getByRole("link", { name: "Back to Positions" });
  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await back.click();
  await expect.poll(() => messages).toEqual(["There is 1 unsaved change. Leave and discard it?"]);
  await expect(page).toHaveURL(/\/posicoes\/cotacoes$/);
  await expect(field).toHaveValue("400000,5");


  page.once("dialog", (dialog) => void dialog.accept());
  await back.click();
  await expect(page).toHaveURL(/\/posicoes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
});

test("quote editing shows a preview and blocks invalid values", async ({ page }) => {
  await page.goto("/posicoes/cotacoes");
  await skipWithoutEditableQuote(page);
  await enterQuoteEditMode(page);
  await expect(page.getByText("Edit mode")).toBeVisible();

  const inputs = page.getByRole("textbox", { name: /^Price of / });
  await inputs.first().fill("abc");
  await expect(page.getByText("1 invalid value")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.locator("[data-quote-cell]")).toHaveCount(0);
  await expect(page.getByText(/alteraç(ão|ões) pendente/)).toHaveCount(0);
});

test("the latest job appears in the update card and identifies failed assets", async ({ page }) => {
  const automatic = stubRun({
    id: "00000000-0000-4000-8000-000000000003",
    status: "COMPLETED_WITH_ISSUES",
    succeeded: 9,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    failures: [
      {
        symbol: "BTC",
        assets: ["Bitcoin 01", "Bitcoin 02"],
        provider: "coingecko",
        errorCode: "NETWORK_ERROR",
        errorMessage: "Could not connect to the provider.",
      },
    ],
  });
  await page.unrouteAll();
  await stubQuoteChecks(page, {
    openCheck: { summary: stubSummary(automatic, automatic.finishedAt) },
    delayMs: 1500,
  });

  await page.goto("/posicoes/cotacoes");

  const card = page.getByRole("region", { name: "Last update" });


  await expect(card).not.toContainText("Updating quotes…");
  await expect(card.getByRole("button")).toHaveCount(0);

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("BTC quote not updated");
  await expect(toast).toContainText("Bitcoin 01, Bitcoin 02");
  await expect(toast).toContainText("CoinGecko: Could not connect to the provider.");
  await expect(card).toContainText("Updated just now");
  await expect(card).toContainText("In this update: 1 failed quote (BTC).");
});

test("retired pages no longer exist", async ({ page }) => {
  for (const path of ["/atualizacao", "/importacao"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }

  await page.goto("/configuracao");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio targets" })).toBeVisible();
  await expect(page.getByText("Dados da carteira")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Revisão de dados|Atualização/ })).toHaveCount(0);
});
