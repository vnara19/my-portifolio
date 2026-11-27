import { expect, test, type Page } from "@playwright/test";

import {
  competenceNav,
  competenceSheet,
  competenceTrigger,
  openCompetenceSheet,
  waitForCompetenceHydration,
} from "./support/competence";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "The reporting-month sheet is for mobile; desktop uses the timeline.");
  await stubQuoteChecks(page);
});

const months = (page: Page) => competenceSheet(page).getByTestId("month-sheet-months").getByRole("button");
const years = (page: Page) => competenceSheet(page).getByTestId("month-sheet-years").getByRole("button");

async function openOverview(page: Page, month: string) {
  await page.goto(`/?mes=${month}`);
  await waitForCompetenceHydration(page);
}

test("the compact selector shows the reporting month and opens its year", async ({ page }) => {
  await openOverview(page, "2026-02");

  await expect(competenceNav(page)).toBeHidden();
  const trigger = competenceTrigger(page);
  await expect(trigger).toHaveAccessibleName("Reporting month: February 2026");
  await expect(trigger).toContainText("Fev/26");
  expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(40);

  await openCompetenceSheet(page);
  await expect(competenceSheet(page).getByRole("group", { name: "Months in 2026" })).toBeVisible();
  await expect(years(page).first()).toHaveText("2026");
  await expect(years(page).first()).toHaveAttribute("aria-pressed", "true");
  await expect(months(page)).toHaveCount(12);
  await expect(months(page).filter({ hasText: "Feb" })).toHaveAttribute("aria-current", "date");
  await expect(months(page).filter({ hasText: "Jan" })).toHaveAccessibleName(/^Janeiro de 2026, [+-]/);


  for (const target of [years(page).first(), months(page).first()]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("browsing years does not write; choosing a month updates selection and closes the sheet", async ({ page }) => {
  await openOverview(page, "2026-02");
  await openCompetenceSheet(page);

  await competenceSheet(page).getByRole("button", { name: "2025", exact: true }).click();
  await expect(competenceSheet(page).getByRole("group", { name: "Months in 2025" })).toBeVisible();
  await expect(page).toHaveURL(/mes=2026-02/);
  await expect(competenceSheet(page).getByRole("button", { name: "2026, selected reporting month" })).toBeVisible();
  await expect(competenceSheet(page).locator("[aria-current='date']")).toHaveCount(0);

  await competenceSheet(page).getByRole("button", { name: /^Dezembro de 2025/ }).click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(competenceTrigger(page)).toHaveAccessibleName("Reporting month: December 2025");
  await expect(competenceTrigger(page)).toContainText("Dez/25");


  await openCompetenceSheet(page);
  await expect(competenceSheet(page).getByRole("group", { name: "Months in 2025" })).toBeVisible();
});

test("an unavailable month is disabled and does not change selection", async ({ page }) => {
  await openOverview(page, "2026-02");
  await openCompetenceSheet(page);


  await competenceSheet(page).getByRole("button", { name: "2023", exact: true }).click();
  await expect(competenceSheet(page).getByRole("button", { name: "January 2023" })).toBeDisabled();
  await expect(months(page)).toHaveCount(12);

  await competenceSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/mes=2026-02/);


  await openCompetenceSheet(page);
  await months(page).filter({ hasText: "Feb" }).click();
  await expect(competenceSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/mes=2026-02/);
});

test("unsaved changes block month changes but not year browsing", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openOverview(page, "2026-09");
  await page.goto("/configuracao?mes=2026-09");
  await waitForCompetenceHydration(page);
  await page.getByRole("textbox", { name: "Tolerance in percentage points" }).fill("3");
  await expect(page.getByText("1 change", { exact: true })).toBeVisible();

  await openCompetenceSheet(page);
  await competenceSheet(page).getByRole("button", { name: "2025", exact: true }).click();
  expect(dialogs).toHaveLength(0);

  await competenceSheet(page).getByRole("button", { name: /^Dezembro de 2025/ }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("unsaved change");
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(competenceTrigger(page)).toHaveAccessibleName("Reporting month: September 2026");

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("1 change", { exact: true })).toHaveCount(0);
});

test("the selector and month status fit without horizontal page scrolling", async ({ page }) => {
  await openOverview(page, "2026-09");

  const fits = () =>
    page.evaluate(() => {
      const band = document.querySelector("[data-testid='month-trigger']")!.parentElement!.getBoundingClientRect();
      const lock = document.querySelector("[data-testid='month-lock']")!.getBoundingClientRect();
      const trigger = document.querySelector("[data-testid='month-trigger']")!.getBoundingClientRect();

      return {
        page: document.documentElement.scrollWidth <= window.innerWidth,
        inside: trigger.left >= band.left && lock.right <= band.right + 1,
        apart: trigger.right <= lock.left,
      };
    });

  const ok = { page: true, inside: true, apart: true };
  await expect.poll(fits).toEqual(ok);


  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(fits).toEqual(ok);
});
