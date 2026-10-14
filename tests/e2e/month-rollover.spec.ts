import { expect, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";


test("opening the application announces creation of the current reporting month", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: {
        state: "created",
        months: [
          {
            month: "2026-10",
            sourceMonth: "2026-09",
            isCurrent: true,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "USD"],
          },
        ],
      },
      summary: null,
    },
  });
  await page.goto("/");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("October 2026 reporting month created");
  await expect(toast).toContainText("Positions and allocations copied from Sep/26.");
  await expect(toast).not.toContainText("Reuses the quote");
});

test("past months missing daily quotes are highlighted", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: {
        state: "created",
        months: [
          {
            month: "2026-11",
            sourceMonth: "2026-10",
            isCurrent: false,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "VOO"],
          },
          {
            month: "2026-12",
            sourceMonth: "2026-11",
            isCurrent: true,
            positions: 21,
            quotesFromHistory: [],
            carriedQuotes: ["BTC", "VOO"],
          },
        ],
      },
      summary: null,
    },
  });
  await page.goto("/posicoes?mes=2026-09");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("2 reporting months created: Nov/26 and Dec/26");
  await expect(toast).toContainText("Each month copied positions and allocations from the previous month, starting with Oct/26.");
  await expect(toast).toContainText("Nov/26");
  await expect(toast).toContainText("Reuses the Oct/26 quote for BTC, VOO.");
  await expect(toast).not.toContainText("Reuses the Nov/26 quote");

  await toast.locator('button[aria-label="Fechar aviso"]').click();
  await expect(toast).toHaveCount(0);
});

test("a rollover failure is announced without breaking the page", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: {
      rollover: { state: "unavailable", message: "Could not create the reporting month." },
      summary: null,
    },
  });
  await page.goto("/");

  await expect(page.getByTestId("app-toast")).toContainText("Could not create the reporting month");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();
});

test("month rollover asks before creating a reporting month", async ({ page }) => {

  await stubQuoteChecks(page, {
    openCheck: { rollover: { state: "pending", latestMonth: "2026-10", months: ["2026-11"] }, summary: null },
  });
  await page.goto("/");

  const prompt = page.getByTestId("month-rollover-prompt");
  await expect(prompt).toContainText("Start November 2026?");
  await expect(prompt).toContainText("Positions and allocations from Oct/26 carry forward to Nov/26, and Oct/26 is closed.");
  await expect(prompt.getByRole("button", { name: "Criar Nov/26" })).toBeVisible();

  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("app-toast")).toHaveCount(0);


  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(prompt).toHaveCount(0);
});

test("multiple missing months are listed in the confirmation", async ({ page }) => {
  await stubQuoteChecks(page, {
    openCheck: { rollover: { state: "pending", latestMonth: "2026-10", months: ["2026-11", "2026-12"] }, summary: null },
  });
  await page.goto("/");

  const prompt = page.getByTestId("month-rollover-prompt");
  await expect(prompt).toContainText("Create 2 reporting months?");
  await expect(prompt).toContainText("Nov/26 and Dec/26, each from the previous month, starting with Oct/26.");
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(prompt).toHaveCount(0);
});
