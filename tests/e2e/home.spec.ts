import { expect, test } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { chooseFilter, usesFilterSheet } from "./support/position-filters";
import { stubQuoteChecks } from "./support/quote-checks";
import { expectCompetence } from "./support/competence";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("displays the normalized portfolio", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Portfolio overview",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
  await expect(page.getByRole("heading", { name: "Portfolio value over time" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asset class" })).toBeVisible();

  await page.getByRole("link", { name: "Portfolio settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio targets" })).toBeVisible();
});

test("the global month selector controls all screens", async ({ page }) => {
  await page.goto("/?mes=2026-02");

  await expectCompetence(page, "February 2026");

  await page.getByRole("link", { name: "Positions" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-02/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
});

test("an unknown month falls back to the latest reporting month", async ({ page }) => {
  await page.goto("/?mes=1999-01");

  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
});

test("overview toggles chart stacking", async ({ page }) => {
  await page.goto("/?mes=2026-05");
  await waitForHydration(page);

  await expect(page.getByTestId("portfolio-total")).toContainText("R$");

  const chart = page.locator("#evolucao");
  await chart.getByRole("button", { name: "Class", exact: true }).click();
  await expect(chart.getByRole("button", { name: "Class", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("position filters combine and total the selected view", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");

  await expect(page.getByText("21 of 21 positions")).toBeVisible();

  await chooseFilter(page, "Institution", "Inter", /inst=Inter/);
  await expect(page.getByText(/^\d+ of 21 positions$/)).not.toHaveText("21 of 21 positions");

  await page.goto("/posicoes?mes=2026-09&classe=Renda%20Vari%C3%A1vel&agrupar=classe");
  await expect(page.getByText("Share in selected classes")).toBeVisible();

  await page.reload();

  await expect(
    (await usesFilterSheet(page))
      ? page.getByRole("button", { name: "Filtros, 1 ativo" })
      : page.getByRole("combobox", { name: /Classe\s*1/ }),
  ).toBeVisible();
});

test("the table shows class, subclass and redemption term and expands its rows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/posicoes?mes=2026-09");


  const headers = page.getByRole("columnheader");
  await expect(headers.filter({ hasText: /^Classes$/ })).toHaveCount(1);
  for (const removed of [/Quote/, /^Currency$/, /^Liquidity$/]) {
    await expect(headers.filter({ hasText: removed })).toHaveCount(0);
  }
  await expect(page.getByRole("combobox", { name: "Currency", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Liquidity", exact: true })).toBeVisible();

  const row = (asset: string) => page.getByTestId("position-row").filter({ hasText: asset }).first();
  await expect(row("LCD BNDES LIQUIDEZ").getByTestId("position-classes")).toHaveText("Cash · Floating-rate · Short-term");
  await expect(row("Bitcoin 01").getByTestId("position-classes")).toHaveText("Cripto · BTC");


  const pension = row("Previdência - Grão FIM");
  await expect(pension.getByTestId("position-classes")).toContainText("…+5");
  await pension.getByRole("button", { name: "Expand Previdência - Grão FIM" }).click();
  const details = page.getByTestId("position-details");
  await expect(details).toBeVisible();
  await expect(details.getByTestId("position-details-allocations").getByRole("listitem")).toHaveCount(6);
  await expect(details).toContainText("Balance, without a quote");
  await expect(details).toContainText("BRL");
  await pension.getByRole("button", { name: "Collapse Previdência - Grão FIM" }).click();
  await expect(details).toHaveCount(0);
});

test("a closed month does not offer editing", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");

  await expect(page.getByTestId("month-locked")).toContainText("Aug/26 is closed");
  await expect(page.getByRole("button", { name: "Add position" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remover / })).toHaveCount(0);
});

test("settings simulate targets before saving", async ({ page }) => {
  await page.goto("/configuracao?mes=2026-09");
  await waitForHydration(page);

  await expect(page.getByRole("heading", { level: 1, name: "Portfolio targets" })).toBeVisible();
  const preview = page.getByRole("complementary", { name: "Rebalancing preview" });

  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect(preview).toContainText("Set/26");
  } else {
    await expect(preview).toBeHidden();
  }

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const original = await caixa.inputValue();
  await caixa.fill(String(Number(original.replace(",", ".")) + 5).replace(".", ","));

  await expect(page.getByText("1 group does not total 100%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save targets" })).toBeDisabled();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(caixa).toHaveValue(original);
});

test("tolerance changes the preview before saving", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "The preview is hidden on mobile (spec 080).");
  await page.goto("/configuracao?mes=2026-09");
  await waitForHydration(page);

  const tolerance = page.getByRole("textbox", { name: "Tolerance in percentage points" });
  await expect(tolerance).toHaveValue("2");

  const actions = page
    .getByRole("complementary", { name: "Rebalancing preview" })
    .getByText(/^(Comprar|Vender)$/);
  const before = await actions.count();

  await tolerance.fill("20");
  await expect(page.getByText("1 change")).toBeVisible();
  await expect.poll(() => actions.count()).toBeLessThan(before);
  await expect(page.getByRole("button", { name: "Save targets" })).toBeEnabled();

  await tolerance.fill("25");
  await expect(page.getByText("Use a tolerance between 0 and 20")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save targets" })).toBeDisabled();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(tolerance).toHaveValue("2");
  await expect.poll(() => actions.count()).toBe(before);
});

test("allocation tabs update both the chart and buy/sell preview", async ({ page }) => {
  await page.goto("/?mes=2026-09");


  const tabs = page.getByRole("group", { name: "Allocation view" });
  const division = page.getByRole("group", { name: "View breakdown" });
  const chart = page.getByTestId("composition-chart");
  await expect(page.getByRole("heading", { name: "Buy and sell" })).toBeVisible();
  await expect(chart.getByRole("heading", { name: "Asset class" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asset type" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Currency", exact: true })).toHaveCount(0);

  await division.getByRole("button", { name: "Currency", exact: true }).click();
  await expect(page).toHaveURL(/sub=moeda/);
  await expect(chart.getByRole("heading", { name: "Currency", exact: true })).toBeVisible();

  await tabs.getByRole("button", { name: "Fixed income", exact: true }).click();
  await expect(page).toHaveURL(/corte=renda-fixa/);

  await expect(division.getByRole("button", { name: "Subclass", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Fixed income by redemption term" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Buy and sell" }).getByRole("row").filter({ hasText: "IPCA ·" }).first()).toBeVisible();

  await tabs.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(chart.getByRole("heading", { name: "Cash by currency" })).toBeVisible();
  await tabs.getByRole("button", { name: "Equities", exact: true }).click();
  await expect(chart.getByRole("heading", { name: "Equities by subclass" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio value over time" })).toBeVisible();
});
