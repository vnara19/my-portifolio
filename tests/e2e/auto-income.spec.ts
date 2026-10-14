import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeForm, formTab, openEditableMonth, openEditForm, positionRow, waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const POSITION_PATH = /\/posicoes\/[0-9a-f-]{36}\/[0-9a-f-]{36}/;

async function openPosition(page: Page, asset: string, query = "mes=2026-09") {
  await page.goto(`/posicoes?${query}`);
  await waitForHydration(page);
  await positionRow(page, asset).getByRole("link", { name: asset, exact: true }).click();
  await expect(page).toHaveURL(POSITION_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: asset })).toBeVisible();
}

async function openMovements(page: Page) {
  const section = page.getByTestId("position-transactions-section");
  await section.getByRole("button", { name: /^Transactions/ }).click();
  await expect(section.getByTestId("position-transactions")).toBeVisible();
  return section;
}

const chipCount = async (chip: Locator) => Number((await chip.innerText()).replace(/\D/g, ""));

test("transactions filter by type with a count for each type", async ({ page }) => {
  // Bitcoin 01: June 2023 opening balance and purchases (specs 071 and 073).
  await openPosition(page, "Bitcoin 01");
  const section = await openMovements(page);
  const filters = section.getByRole("group", { name: "Transaction type" });
  const rows = section.getByTestId("position-transactions").locator("tbody tr");
  const all = filters.getByRole("button", { name: "All", exact: true });
  const contributions = filters.getByRole("button", { name: /^Aportes/ });
  const opening = filters.getByRole("button", { name: /^Saldo inicial/ });
  const total = await rows.count();

  await expect(all).toHaveAttribute("aria-pressed", "true");

  await expect(filters.getByRole("button")).toHaveCount(
    1 + (await section.getByTestId("position-transactions").evaluate((table) =>
      new Set([...table.querySelectorAll("tbody tr")].map((row) => row.getAttribute("data-transaction-filter"))).size,
    )),
  );

  await contributions.click();
  await expect(contributions).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(rows).toHaveCount(await chipCount(contributions));
  await expect(rows.and(page.locator('[data-transaction-filter="CONTRIBUTION"]'))).toHaveCount(await chipCount(contributions));

  await opening.click();
  await expect(rows).toHaveCount(await chipCount(opening));
  await expect(rows.first()).toHaveAttribute("data-transaction-kind", "OPENING");

  await all.click();
  await expect(rows).toHaveCount(total);
});

test("fixed-income targets include fixed-rate allocations and hide zero-value zero-target categories", async ({ page }) => {
  await page.goto("/configuracao");
  const matrix = page.getByRole("region", { name: "Fixed income: subclass × redemption term" });
  await expect(matrix.getByText("Floating-rate", { exact: true })).toBeVisible();
  await expect(matrix.getByText("Fixed-rate", { exact: true })).toBeVisible();


  await page.goto("/?mes=2026-09&corte=renda-fixa");
  const allocation = page.getByRole("region", { name: "Allocation" });
  await allocation.scrollIntoViewIfNeeded();
  const shares = await allocation.locator("table tbody tr").evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")),
  );
  for (const cells of shares) {
    expect(cells.filter((cell) => /^0,0\s?%$/.test(cell)).length, cells.join(" | ")).toBeLessThan(2);
  }
});

test("each compatible allocation has its own rate and automatic accrual requires every rate", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open month to edit.");
  const asset = await page
    .getByTestId("position-row")
    .filter({ hasText: /· Renda fixa/ })
    .filter({ hasText: "Floating-rate" })
    .first()
    .getByRole("link")
    .first()
    .innerText()
    .catch(() => null);
  test.skip(!asset, "No floating-rate fixed-income position in the open month.");

  const dialog = await openEditForm(page, asset!.trim());
  await formTab(dialog, "Allocation").click();
  const rates = dialog.getByTestId("allocation-rate");
  const rows = await dialog.locator("[data-allocation-row]").count();
  const compatible = await rates.count();
  expect(compatible).toBeGreaterThan(0);
  await expect(dialog.getByTestId("auto-income")).toBeVisible();


  const added = rows + 1;
  const choose = async (field: string, option: string) => {
    await dialog.getByRole("combobox", { name: `${field} of allocation ${added}`, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  await dialog.getByRole("button", { name: "Add classification" }).click();
  await choose("Class", "Fixed income");
  await choose("Subclass", "Fixed-rate");
  await expect(rates).toHaveCount(compatible + 1);
  await expect(dialog.getByRole("textbox", { name: `Allocation rate of return ${added}` })).toBeVisible();
  await expect(rates.last()).toContainText("% p.a.");
  await choose("Subclass", "IPCA");
  await expect(rates).toHaveCount(compatible);
  await dialog.getByRole("button", { name: `Remove classification ${added}` }).click();


  const first = await rates.first().getByRole("textbox").getAttribute("aria-label");
  await dialog.getByRole("textbox", { name: first! }).fill("");
  await dialog.getByRole("checkbox", { name: "Calculate accrual automatically" }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText("Enter the rate of return to calculate accrual automatically.")).toBeVisible();

  await closeForm(dialog);
});

test("rate-based returns appear as Automatic accrual with a dedicated filter", async ({ page }) => {
  await page.goto("/posicoes");
  await waitForHydration(page);
  const asset = await page
    .getByTestId("position-row")
    .filter({ hasText: /· Renda fixa|Caixa em reais/ })
    .first()
    .getByRole("link")
    .first()
    .innerText()
    .catch(() => null);
  test.skip(!asset, "No fixed-income or BRL cash position in the month.");
  await positionRow(page, asset!.trim()).getByRole("link", { name: asset!.trim(), exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: asset!.trim() })).toBeVisible({ timeout: 15_000 });
  const section = await openMovements(page);
  const automatic = section.getByTestId("position-transactions").locator('tbody tr[data-transaction-filter="AUTO_INCOME"]');
  test.skip((await automatic.count()) === 0, "No automatic accrual in this position.");

  await expect(automatic.first()).toContainText("Automatic accrual");
  const chip = section.getByRole("group", { name: "Transaction type" }).getByRole("button", { name: /^Automatic accrual/ });
  await chip.click();
  await expect(section.getByTestId("position-transactions").locator("tbody tr")).toHaveCount(await chipCount(chip));
});
