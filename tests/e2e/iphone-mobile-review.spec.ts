import { expect, test, type Locator, type Page } from "@playwright/test";

import { SIGNED_OUT } from "./support/auth";
import { competenceSheet, competenceTrigger, openCompetenceSheet, waitForCompetenceHydration } from "./support/competence";
import { chooseKind, closeForm, continueForm, expectFormStep, openAddForm, openEditableMonth } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch interface review.");
  await stubQuoteChecks(page);
});

async function assertPageWidth(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}

async function assertInputSize(scope: Locator) {
  const inputs = scope.locator('input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="color"]), textarea, select');
  for (const input of await inputs.all()) {
    if (await input.isVisible()) {
      expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
  }
}


async function swipe(target: Locator, dx: number) {
  const touch = { identifier: 1, clientX: 210, clientY: 220 };
  await target.dispatchEvent("touchstart", { touches: [touch], changedTouches: [touch] });
  await target.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ ...touch, clientX: touch.clientX + dx }],
  });
}

test("the viewport respects safe areas and keeps zoom available", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("viewport-fit=cover");
  expect(viewport).toContain("interactive-widget=resizes-content");
  expect(viewport).not.toMatch(/user-scalable=(?:no|0)|maximum-scale=1(?:,|$)/);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /.+/);
});

test("main screens fit portrait and landscape layouts", async ({ context }) => {
  for (const viewport of [{ width: 430, height: 739 }, { width: 814, height: 380 }]) {
    for (const url of ["/", "/posicoes", "/posicoes/cotacoes", "/configuracao"]) {
      const page = await context.newPage();
      await stubQuoteChecks(page);
      await page.setViewportSize(viewport);
      await page.goto(url);
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await assertPageWidth(page);
      await assertInputSize(page.locator("body"));
      await page.close();
    }
  }
});

test("target sliders use a full-width row on mobile", async ({ page }) => {
  await page.goto("/configuracao");
  const slider = page.getByRole("slider", { name: "Cash target", exact: true });
  const control = page.locator("[data-base-ui-slider-control]").filter({ has: slider });
  const input = page.getByRole("textbox", { name: "Cash percentage" });
  await expect(slider).toBeVisible();
  const track = await control.boundingBox();
  const field = await input.boundingBox();
  expect(track).not.toBeNull();
  expect(field).not.toBeNull();
  expect(track!.width).toBeGreaterThan(250);
  expect(track!.y).toBeGreaterThanOrEqual(field!.y + field!.height);
  await assertInputSize(page.locator("body"));
});

test("horizontal swiping does not switch tabs; tapping does", async ({ page }) => {

  await page.goto("/?mes=2026-09");
  const heading = page.getByRole("heading", { name: "Portfolio overview" });
  await expect(heading).toBeVisible();
  await swipe(heading, -100);
  await swipe(heading, 100);
  await expect(page).toHaveURL(/\/\?mes=2026-09$/);
  await expect(heading).toBeVisible();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Positions" }).click();
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
  await swipe(page.getByRole("heading", { name: "Monthly portfolio" }), 100);
  await expect(page).toHaveURL(/\/posicoes\?mes=2026-09$/);
});

test("the month sheet opens on the active month with usable touch targets", async ({ page }) => {
  await page.goto("/?mes=2026-09");
  await waitForCompetenceHydration(page);
  const trigger = competenceTrigger(page);
  await expect(trigger).toHaveAccessibleName("Reporting month: September 2026");
  expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(40);

  await openCompetenceSheet(page);
  const active = competenceSheet(page).locator('[aria-current="date"]');
  await expect(active).toHaveAccessibleName(/^Setembro de 2026/);
  expect((await active.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await assertPageWidth(page);

  await competenceSheet(page).getByRole("button", { name: /^Agosto de 2026/ }).click();
  await expect(page).toHaveURL(/mes=2026-08/);
  await expect(competenceSheet(page)).toHaveCount(0);
});

test("the position form remains scrollable in a reduced viewport", async ({ page }) => {
  test.skip(!(await openEditableMonth(page)), "No open reporting month in the test data.");
  const dialog = await openAddForm(page);
  await expectFormStep(dialog, "Position");
  await chooseKind(page, dialog, /Renda fixa/);
  const institution = dialog.getByRole("combobox", { name: "Institution", exact: true });
  await institution.click();
  await page.getByRole("option", { name: "C6", exact: true }).click();
  await continueForm(dialog, "Asset");
  await dialog.getByRole("textbox", { name: "Asset name", exact: true }).fill("CDB Teste mobile");
  await dialog.getByRole("textbox", { name: "Balance (BRL)", exact: true }).fill("1000");
  await page.setViewportSize({ width: 430, height: 420 });
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  const box = await dialog.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(420);
  await assertInputSize(dialog);
  await closeForm(dialog);
});

test.describe("sign-in without a session", () => {
  test.use({ storageState: SIGNED_OUT });

  test("sign-in and registration fields remain readable without clipping actions", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page.getByLabel("Email")).toBeVisible();
    await assertInputSize(page.locator("body"));
    await assertPageWidth(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByLabel("Name")).toBeVisible();
    await assertInputSize(page.locator("body"));
    await assertPageWidth(page);
  });
});
