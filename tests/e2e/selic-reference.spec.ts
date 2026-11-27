import { expect, test } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("monthly Selic appears in overview and quotes without browser calls to Banco Central", async ({ page }) => {
  const providerRequests: string[] = [];
  await page.route(/https:\/\/[^/]*bcb\.gov\.br\//, async (route) => {
    providerRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  const overview = page.getByTestId("selic-month");
  await expect(overview).toBeVisible();
  await expect(overview).toContainText("Selic rate this month");
  await expect(overview).toContainText(/\d+\.\d{2}% p\.a\./);
  await expect(overview).toContainText("Copom Selic target on 30/09/2026");
  await expect(overview).not.toContainText("R$");

  await expect(page.getByTestId("selic-reference")).toHaveCount(0);
  const card = page.locator(".metric-card").filter({ has: overview });
  await expect(card).toContainText("USD this month");

  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await waitForHydration(page);
  const quotes = page.getByTestId("selic-month");
  await expect(quotes).toContainText(/Selic rate this month \d+\.\d{2}% p\.a\./);
  await expect(quotes).not.toContainText("CDI");
  expect(providerRequests).toEqual([]);
});

test("Selic follows the selected reporting month", async ({ page }) => {
  await page.goto("/?mes=2024-12");
  await waitForHydration(page);
  const december = await page.getByTestId("selic-month").textContent();
  await expect(page.getByTestId("selic-month")).toContainText("on 31/12/2024");
  await page.goto("/?mes=2026-09");
  await waitForHydration(page);
  await expect(page.getByTestId("selic-month")).toContainText("on 30/09/2026");

  expect(await page.getByTestId("selic-month").textContent()).not.toBe(december);
});

test("the development refresh button runs only on click and reports its result", async ({ page }) => {
  let syncCalls = 0;
  await page.route("**/api/quotes/dev-sync", async (route) => {
    syncCalls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toContain("application/json");
    await route.fulfill({ json: { ok: true, state: "idle", lines: ["Quotes are up to date: no symbols are due.", "Selic: daily check is up to date."] } });
  });

  for (const path of ["/?mes=2026-09", "/posicoes/cotacoes?mes=2026-09"]) {
    await page.goto(path);
    await waitForHydration(page);
    const button = page.getByRole("button", { name: "Update quotes (dev)", exact: true });
    await expect(button).toBeVisible();
  }
  expect(syncCalls).toBe(0);
  await page.getByRole("button", { name: "Update quotes (dev)", exact: true }).click();
  await expect.poll(() => syncCalls).toBe(1);
  const toast = page.getByTestId("app-toast").filter({ hasText: "Local update completed" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Quotes are up to date: no symbols are due.");
  await expect(toast).toContainText("Selic: daily check is up to date.");
  await expect(page.getByRole("button", { name: "Update quotes (dev)", exact: true })).toBeEnabled();
});
