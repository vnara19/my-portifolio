import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";
import { chooseCompetence, expectCompetence, expectNoCompetenceYear, waitForCompetenceHydration } from "./support/competence";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const POSITION_PATH = /\/posicoes\/[0-9a-f-]{36}\/[0-9a-f-]{36}/;

const row = (page: Page, asset: string) => page.getByTestId("position-row").filter({ hasText: asset });


// Read the unformatted numeric data-value.
const flowValue = (page: Page, testId: string) => async () =>
  ((await page.getByTestId(testId).getAttribute("data-value")) ?? "").replace(/\s/g, " ");

async function openPosition(page: Page, asset: string, query = "mes=2026-09", institution?: string) {
  await page.goto(`/posicoes?${query}`);


  await waitForCompetenceHydration(page);
  const rows = institution ? row(page, asset).filter({ hasText: institution }) : row(page, asset);
  await rows.getByRole("link", { name: asset, exact: true }).click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: asset })).toBeVisible();
}

const openBitcoin01 = (page: Page, query?: string) => openPosition(page, "Bitcoin 01", query);

test("asset names open position detail and returning preserves month and filters", async ({ page }) => {
  await openBitcoin01(page, "mes=2026-09&classe=Cripto&ordem=share.desc");

  await expect(page).toHaveURL(/\?mes=2026-09&classe=Cripto&ordem=share\.desc$/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Positions" }),
  ).toHaveAttribute("aria-current", "page");
  await expectCompetence(page, "September 2026");

  await page.getByRole("link", { name: "Back to Positions" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09&classe=Cripto&ordem=share\.desc$/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crypto", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("quoted position detail attributes changes to prices and contributions", async ({ page }) => {
  await openBitcoin01(page);


  await expect(page.getByText("Ledger", { exact: true }).first()).toBeVisible();
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 130.457");
  await expect(page.getByText("0,30045274 BTC × R$ 434.201,00")).toBeVisible();
  await expect.poll(flowValue(page, "position-month-change")).toBe("+6,24%");
  await expect.poll(flowValue(page, "position-share")).toBe("49,3%");
  await expect(page.getByRole("heading", { name: "BTC price" })).toBeVisible();
  await expect(page.getByTestId("asset-price-chart")).toBeVisible();
  await expect(page.getByTestId("position-evolution-chart")).toBeVisible();

  // Use the full available width (spec 045).
  await expect(page.getByTestId("position-single-allocation")).toContainText("Cripto · BTC");
  await expect(page.getByTestId("position-allocation")).toHaveCount(0);
  await expect(page.getByTestId("position-maturity")).toHaveCount(0);

  // Cost basis and returns include the June 2023 opening balance (spec 073).

  await expect.poll(flowValue(page, "position-applied")).toBe("R$ 73.926");
  await expect(page.getByTestId("position-gain")).toContainText("+R$ 56.530,46");


  await expect(page.getByRole("button", { name: "All accounts" })).toHaveCount(0);
  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Saldo de partida · Jun/23R$ 26.321,77");
  await expect(values).toContainText("Aportes menos retiradas+R$ 47.604,65");
  await expect(values).toContainText("Efeito de preço+R$ 56.530,46");
  await expect(values).toContainText("Valor em Set/26R$ 130.456,88");


  const average = page.getByTestId("position-applied").locator("..").getByTestId("position-average-price");
  await expect(average).toContainText("Preço médio R$ 246.050");
  await expect(average).toHaveAttribute("title", "Average cost with opening balance");
  await expect(page.getByRole("heading", { name: "Destaques" })).toHaveCount(0);


  await page.getByTestId("position-highlights").click();
  await expect(page.getByTestId("position-best-month")).toBeVisible();
  await expect(page.getByTestId("position-worst-month")).toBeVisible();
  await page.keyboard.press("Escape");


  await expect(page.getByText("Click a month to open")).toHaveCount(0);
  await expect(page.getByText("Contributions and withdrawals use transaction amounts")).toHaveCount(0);


  const monthsToggle = page.getByRole("button", { name: /^Month by month/ });
  await expect(monthsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("position-months")).toBeHidden();
  await monthsToggle.click();
  await expect(page.getByTestId("position-months")).toBeVisible();
  const movementsToggle = page.getByRole("button", { name: /^Transactions/ });
  await expect(movementsToggle).toHaveAttribute("aria-expanded", "false");
  await movementsToggle.click();
  await expect(page.getByTestId("position-transactions")).toBeVisible();


  const periods = page.getByRole("group", { name: "Monthly change period" });
  await expect(periods.getByRole("button", { name: "12M" })).toHaveAttribute("aria-pressed", "true");
  await periods.getByRole("button", { name: "6M" }).click();
  await expect(periods.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["YTD", "All"]) {
    await expect(periods.getByRole("button", { name: label })).toBeVisible();
  }


  await expect(page.getByRole("link", { name: "Back to Positions" })).toHaveAttribute("href", "/posicoes?mes=2026-09");
});

test("all accounts aggregate the asset across institutions", async ({ page }) => {

  await openPosition(page, "USDC", "mes=2025-09", "AAVE");

  await expect(page.getByText("Also in Binance (Feb/24 to Oct/25)", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "All accounts" }).click();
  await expect(page).toHaveURL(/contas=todas/);
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 9.390");


  await expect(page.getByTestId("position-gain")).toContainText("+R$ 2.953,92");


  const values = page.getByTestId("attribution-values");
  await expect(values).toContainText("Saldo de partida · Fev/24R$ 18.042,29");
  await expect(values).toContainText("Aportes menos retiradas-R$ 17.272,07");
  await expect(values).toContainText("Rendimentos incorporados+R$ 468,85");
  await expect(values).toContainText("Saldo inicial registrado+R$ 5.665,74");
  await expect(values).toContainText("Valor em Set/25R$ 9.389,88");
});

test("liquidated positions remain in their withdrawal month", async ({ page }) => {

  // The position re-entered in April 2024.
  await openPosition(page, "Bitcoin 02");
  await page.getByRole("button", { name: /^Month by month/ }).click();
  const months = page.getByTestId("position-months");
  await expect(months.locator("tr[data-gap='absent']")).toHaveCount(0);
  await expect(months.getByRole("row", { name: /^Mar\/24/ })).toContainText("Liquidated");
  await expect(months.getByRole("row", { name: /^Abr\/24/ })).toContainText("Back");
  await expect(months.getByRole("row", { name: /^Set\/26/ })).toHaveAttribute("aria-current", "date");

  await expect(months.locator("tr[data-gap='missing']")).toHaveCount(0);


  // AAVE: aggregating accounts fills the history gaps.
  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  await page.getByRole("button", { name: /^Month by month/ }).click();
  await expect(months.getByRole("row", { name: /^Out\/25/ })).toContainText("Liquidated");
  await expect(months.locator("tr[data-gap='absent']")).toContainText(/^Nov\/25 a .*Fora desta conta · em AAVE/);
  await page.getByRole("button", { name: "All accounts" }).click();
  await expect(page).toHaveURL(/contas=todas/);
  await expect(months.locator("tr[data-gap='absent']")).toHaveCount(0);
});

test("clicking a cash-position row opens its detail", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await waitForCompetenceHydration(page);
  await row(page, "Porquinho").getByText("R$ 2.427,12").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();

  await expect(page.getByText("BALANCE", { exact: true })).toBeVisible();
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 2.427");
  await expect.poll(flowValue(page, "position-month-change")).toBe("-52,1%");
  await expect(page.getByRole("heading", { name: "Monthly balance change" })).toBeVisible();
  await expect(page.getByTestId("balance-change-chart")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Price of/ })).toHaveCount(0);
  await expect(page.getByTestId("position-average-price")).toHaveCount(0);
  // The CDB fixture includes an opening balance, contributions, withdrawals and returns.

  await expect(page.getByTestId("attribution-values")).toContainText("Saldo de partida · Jul/25R$ 6.474,05");
  await expect(page.getByTestId("attribution-values")).toContainText("Aportes menos retiradas-R$ 5.070,73");
  await expect(page.getByTestId("attribution-values")).toContainText("Rendimentos incorporados+R$ 1.023,80");
  await expect(page.getByTestId("attribution-values")).toContainText("Valor em Set/26R$ 2.427,12");
  await expect(page.getByRole("button", { name: "All accounts" })).toHaveCount(0);


  await expect(page.getByTestId("position-maturity")).toHaveCount(0);
  await expect(page.getByTestId("position-chips").getByTestId("position-liquidity")).toContainText("Liquidity");
  await expect(page.getByTestId("position-presence")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Renomear ativo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit position" })).toBeVisible();
});

test("row action buttons do not navigate to position detail", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await waitForCompetenceHydration(page);

  const ledger = row(page, "Bitcoin 01").filter({ hasText: "Ledger" });

  await ledger.getByRole("button", { name: "Expandir Bitcoin 01" }).click();
  await expect(page.getByTestId("position-details")).toBeVisible();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});

test("the selector changes month and includes only months containing the position", async ({ page }) => {
  await openBitcoin01(page);
  const path = new URL(page.url()).pathname;

  await waitForCompetenceHydration(page);
  await chooseCompetence(page, "August 2026");
  await expect(page).toHaveURL(new RegExp(`${path}\\?mes=2026-08$`));
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 122.798");


  await openPosition(page, "Bitcoin 02");
  await page.goto(`${new URL(page.url()).pathname}?mes=2024-03`);
  await expect(page.getByTestId("position-liquidated")).toHaveText("Liquidated on 01/03/2024");
  await expect.poll(flowValue(page, "position-value")).toBe("R$ 0");


  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  const usdc = new URL(page.url()).pathname;
  await waitForCompetenceHydration(page);
  await expectNoCompetenceYear(page, 2026);
  await page.goto(`${usdc}?mes=2026-09`);
  await expect(page).toHaveURL(new RegExp(`${usdc}\\?mes=2025-10$`));
  await expect(page.getByTestId("position-liquidated")).toBeVisible();
});

test("the liquidation badge navigates to the closing month", async ({ page }) => {

  await openPosition(page, "USDC", "mes=2025-09", "Binance");
  await page.getByTestId("position-liquidated").click();
  await expect(page).toHaveURL(/mes=2025-10/);
  await expect(page.getByTestId("position-liquidated")).toHaveText("Liquidated on 01/10/2025");
  await page.getByRole("button", { name: /^Transactions/ }).click();
  await expect(page.getByTestId("position-transactions").locator("tr[data-transaction-kind='WITHDRAWAL']").first()).toContainText(
    "Liquidation",
  );
});

test("clicking or tapping position charts does not change month", async ({ page }) => {

  await openBitcoin01(page);
  const url = page.url();
  for (const testId of ["position-evolution-chart", "balance-change-chart"]) {
    const chart = page.getByTestId(testId).locator(".recharts-wrapper").first();
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  }
  await page.waitForTimeout(600);
  expect(page.url()).toBe(url);
});

test("touch tooltips disappear when the finger leaves", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch gesture (spec 078).");
  await openBitcoin01(page);
  const chart = page.getByTestId("position-evolution-chart");
  const wrapper = chart.locator(".recharts-wrapper").first();
  await wrapper.scrollIntoViewIfNeeded();
  const box = (await wrapper.boundingBox())!;
  const touch = { identifier: 1, clientX: box.x + box.width * 0.5, clientY: box.y + box.height * 0.5 };
  const tooltip = chart.locator(".recharts-tooltip-wrapper");

  await wrapper.dispatchEvent("touchstart", { touches: [touch], changedTouches: [touch], targetTouches: [touch] });
  await wrapper.dispatchEvent("touchmove", { touches: [touch], changedTouches: [touch], targetTouches: [touch] });
  await expect(tooltip).toContainText("R$");
  await expect(tooltip).toBeVisible();

  await wrapper.dispatchEvent("touchend", { touches: [], changedTouches: [touch], targetTouches: [] });
  await expect(tooltip).toBeHidden();
});

test("liquidation appears in the exit month and not the next month", async ({ page }) => {
  // LCI BRB exited in October 2026 (spec 076).
  await page.goto("/posicoes?mes=2026-10");
  const liquidated = row(page, "LCI BRB - Set/26");
  await expect(liquidated.getByTestId("position-liquidated")).toHaveText("Liquidated");
  await expect(page.getByTestId("positions-count")).toContainText("1 liquidada");

  await page.goto("/posicoes?mes=2026-09");
  await expect(row(page, "LCI BRB - Set/26").getByTestId("position-liquidated")).toHaveCount(0);
  await expect(page.getByTestId("positions-count")).not.toContainText("liquidated");
});

test("an unknown position shows an explanation and a return link", async ({ page }) => {
  await page.goto(
    "/posicoes/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000?mes=2026-09",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Position not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Positions" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});
