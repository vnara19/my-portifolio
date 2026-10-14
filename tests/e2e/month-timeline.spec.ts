import { expect, test, type Page } from "@playwright/test";

import { waitForCompetenceHydration } from "./support/competence";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

const timeline = (page: Page) => page.getByRole("navigation", { name: "Reporting months" });
const year = (page: Page, value: number) =>
  timeline(page).getByRole("button", { name: String(value), exact: true });
const month = (page: Page, label: string) =>
  timeline(page).getByRole("button", { name: new RegExp(`^${label}`) });


async function openTimeline(page: Page, url: string) {
  await page.goto(url);
  await waitForCompetenceHydration(page);
}


// Mobile month selection is covered by month-sheet.spec.ts (spec 096).
const STRIP_ONLY = "The reporting-month timeline is for desktop; mobile uses the sheet (month-sheet.spec.ts).";

test("the timeline initially expands only the selected year", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");

  await expect(month(page, "February 2026")).toHaveAttribute("aria-current", "date");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "false");
  await expect(timeline(page).getByRole("button", { name: / de 2025/ })).toHaveCount(0);
  await expect(month(page, "January 2026")).toHaveAttribute("aria-label", /^Janeiro de 2026, [+-]/);
});

test("opening a year does not change the reporting month until a month is selected", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");
  await expect(month(page, "February 2026")).toHaveAttribute("aria-current", "date");

  await year(page, 2025).click();
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "false");
  await expect(month(page, "December 2025")).toBeVisible();
  await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  await expect(year(page, 2026)).toHaveAccessibleDescription(
    "Selected reporting month: February 2026",
  );
  await expect(page).toHaveURL(/mes=2026-02/);

  await month(page, "December 2025").click();
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(month(page, "December 2025")).toHaveAttribute("aria-current", "date");
});

test("keyboard navigation crosses years and retains the month in the URL", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-01");
  await expect(month(page, "January 2026")).toHaveAttribute("aria-current", "date");
  await expect(page.getByRole("button", { name: /Previous month|Next month|Latest/ })).toHaveCount(0);

  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2025-12/);
  await expect(year(page, 2025)).toHaveAttribute("aria-expanded", "true");
  await expect(month(page, "December 2025")).toHaveAttribute("aria-current", "date");

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/mes=2026-01/);
  await expect(month(page, "January 2026")).toHaveAttribute("aria-current", "date");

  await page.reload();
  await expect(month(page, "January 2026")).toHaveAttribute("aria-current", "date");
});

test("browsing a year does not reopen it when selection returns", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-02");

  await year(page, 2024).click();
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/mes=2026-03/);
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2026-02/);
  await expect(year(page, 2026)).toHaveAttribute("aria-expanded", "true");
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "false");
  await expect(month(page, "February 2026")).toHaveAttribute("aria-current", "date");
});

test("the lock indicates whether the month is open or closed", async ({ page }) => {

  await openTimeline(page, "/posicoes?mes=2026-08");
  const lock = page.getByTestId("month-lock");
  await expect(lock).toHaveAttribute("data-state", "closed");
  await expect(lock).toContainText("Closed");
  await expect(page.getByRole("button", { name: "Add position" })).toHaveCount(0);
  await expect(page.getByTestId("month-locked")).toContainText("Aug/26 is closed");

  await lock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Open Aug/26?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(lock).toHaveAttribute("data-state", "closed");


  await openTimeline(page, "/posicoes");
  const latest = page.getByTestId("month-lock");
  test.skip((await latest.getAttribute("data-state")) !== "open", "The latest month is closed in the fixture data.");
  await expect(latest.getByRole("button", { name: /^Fechar / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add position" })).toBeVisible();
});

test("focus follows the expanded year even with repeated taps", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-01");
  await month(page, "January 2026").focus();

  await page.keyboard.press("ArrowLeft");
  await expect(month(page, "December 2025")).toHaveAttribute("aria-current", "date");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/mes=2025-11/);
  await expect(month(page, "November 2025")).toHaveAttribute("aria-current", "date");


  await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);
  await expect(month(page, "December 2025")).toBeFocused();
});

test("the timeline fits without shifting the page", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  await openTimeline(page, "/?mes=2026-09");
  await expect(page.getByTestId("portfolio-total")).toContainText("R$");
  await expect(month(page, "September 2026")).toHaveAttribute("aria-current", "date");

  const measure = () =>
    timeline(page).evaluate((strip) => {
      const active = strip.querySelector("[aria-current='date']")!.getBoundingClientRect();
      const box = strip.getBoundingClientRect();

      return {
        fits: strip.scrollWidth <= strip.clientWidth,
        activeVisible: active.left >= box.left - 1 && active.right <= box.right + 1,
        pageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
      };
    });

  await expect.poll(async () => (await measure()).activeVisible).toBe(true);
  expect((await measure()).pageLeft).toBe(0);

  expect((await measure()).fits).toBe(true);

  await month(page, "August 2026").click();
  await expect(page).toHaveURL(/mes=2026-08/);
  await expect.poll(async () => (await measure()).activeVisible).toBe(true);
  expect((await measure()).pageLeft).toBe(0);
});

test("unsaved changes block month changes but not year browsing", async ({ page, isMobile }) => {
  test.skip(isMobile, STRIP_ONLY);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });


  await openTimeline(page, "/configuracao?mes=2026-09");
  await page.getByRole("textbox", { name: "Tolerance in percentage points" }).fill("3");
  await expect(page.getByText("1 change", { exact: true })).toBeVisible();

  const active = timeline(page).locator("[aria-current='date']");
  const activeLabel = await active.getAttribute("aria-label");

  await timeline(page).locator("[data-expanded] [role='group'] button:not([aria-current])").first().click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("unsaved change");
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(active).toHaveAttribute("aria-label", activeLabel!);

  await year(page, 2024).click();
  await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
  expect(dialogs).toHaveLength(1);

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("1 change", { exact: true })).toHaveCount(0);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("changing years reveals months without animating width", async ({ page, isMobile }) => {
    test.skip(isMobile, STRIP_ONLY);
    await openTimeline(page, "/?mes=2026-02");


    const sampling = timeline(page).evaluate(
      (strip) =>
        new Promise<{ panel: string; open: number }[]>((resolve) => {
          const samples: { panel: string; open: number }[] = [];
          const start = performance.now();
          const record = () => {
            for (const panel of strip.querySelectorAll("[role='group']")) {
              const content = panel.firstElementChild!.getBoundingClientRect().width;
              samples.push({
                panel: panel.getAttribute("aria-label")!,
                open: panel.getBoundingClientRect().width / content,
              });
            }

            if (performance.now() - start < 800) {
              requestAnimationFrame(record);
            } else {
              resolve(samples);
            }
          };
          requestAnimationFrame(record);
        }),
    );

    await year(page, 2024).click();
    await expect(year(page, 2024)).toHaveAttribute("aria-expanded", "true");
    await expect(timeline(page).getByRole("button", { name: / de 2024/ }).first()).toBeVisible();
    await expect(timeline(page).getByRole("button", { name: / de 2026/ })).toHaveCount(0);

    const samples = await sampling;
    expect(samples.some((sample) => sample.panel === "Months in 2024" && sample.open > 0.99)).toBe(
      true,
    );
    expect(samples.filter((sample) => sample.open > 0.01 && sample.open < 0.99)).toEqual([]);
  });
});
