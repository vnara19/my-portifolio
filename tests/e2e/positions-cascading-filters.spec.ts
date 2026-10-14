import { expect, test } from "@playwright/test";

import { chooseFilter, filterOptions as optionsOf } from "./support/position-filters";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("choosing a class limits available subclasses", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();


  expect(await optionsOf(page, "Subclass")).toEqual(["Floating-rate", "Stablecoin"]);

  expect(await optionsOf(page, "Class")).toEqual(
    expect.arrayContaining(["Cash", "Crypto", "Fixed income", "Equities"]),
  );
});

test("filters constrain left to right regardless of selection order", async ({ page }) => {


  await page.goto("/posicoes?mes=2026-09&subclasse=P%C3%B3s-fixado&classe=Caixa");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();

  expect(await optionsOf(page, "Class")).toEqual(
    expect.arrayContaining(["Cash", "Crypto", "Fixed income", "Equities"]),
  );
  expect(await optionsOf(page, "Subclass")).toEqual(["Floating-rate", "Stablecoin"]);
});

test("maturity has a column and filter", async ({ page }, testInfo) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();

  expect(await optionsOf(page, "Maturity")).toContain("No maturity date");

  if (!testInfo.project.name.startsWith("mobile")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("columnheader", { name: "Maturity" })).toBeVisible();
  }

  await page.goto("/posicoes?mes=2026-09&venc=Sem%20vencimento");
  await expect(page.getByTestId("position-row").first()).toBeVisible();
});

test("institution choices respect the selected class", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();

  await chooseFilter(page, "Institution", "Inter", /inst=Inter/);


  expect(await optionsOf(page, "Class")).toContain("Crypto");


  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page).toHaveURL(/classe=Caixa/);
  const institutions = await optionsOf(page, "Institution");
  expect(institutions).toContain("Inter");
  expect(institutions).not.toContain("Ledger");
});

test("mobile search and filters share a row and open a filter sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile filter sheet (spec 077).");
  await page.goto("/posicoes?mes=2026-09");
  const search = page.getByRole("searchbox", { name: "Search positions" });
  const filters = page.getByRole("button", { name: /^Filtros/ });
  await expect(search).toBeVisible();
  await expect(filters).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Subclasse/ })).toBeHidden();

  const [searchBox, filtersBox] = await page.evaluate(() => {
    const box = (element: Element | null) => {
      const rect = element!.getBoundingClientRect();
      return { center: rect.top + rect.height / 2, width: rect.width };
    };
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim().startsWith("Filters"));
    return [box(document.querySelector('input[type="search"]')), box(button ?? null)];
  });
  expect(Math.abs(searchBox.center - filtersBox.center)).toBeLessThan(2);
  expect(searchBox.width).toBeGreaterThan(200);

  await filters.click();
  const sheet = page.getByTestId("positions-filter-sheet");
  await sheet.getByRole("group", { name: /^Currency/ }).getByRole("button", { name: "USD", exact: true }).click();
  await expect(page).toHaveURL(/moeda=USD/);
  await sheet.getByRole("group", { name: /^Agrupar/ }).getByRole("button", { name: "Institution", exact: true }).click();
  await expect(page).toHaveURL(/agrupar=instituicao/);
  await sheet.getByRole("button", { name: /^View \d+ positi/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filtros, 1 ativo" })).toBeVisible();
});

test("touch fields use 16 px text to prevent Safari zoom", async ({ page }, testInfo) => {
  await page.goto("/posicoes?mes=2026-09");
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(coarse).toBe(testInfo.project.name.startsWith("mobile"));
  const size = await search.evaluate((element) => getComputedStyle(element).fontSize);
  expect(size).toBe(coarse ? "16px" : "12px");
});

test("liquidity is a filter without a table column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/posicoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
  expect(await optionsOf(page, "Liquidity")).toContain("Liquidity not specified");

  await expect(page.getByRole("columnheader", { name: "Liquidity" })).toHaveCount(0);
});
