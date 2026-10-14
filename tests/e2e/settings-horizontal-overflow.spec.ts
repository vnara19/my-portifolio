import { expect, test, type Page } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome" && testInfo.project.name !== "mobile-safari",
    "Width checked on desktop and iPhone.",
  );
  await stubQuoteChecks(page);
});

const WIDTHS = [320, 360, 375, 390, 414, 430];
const HEIGHT = 900;

type Overflow = { scrollWidth: number; innerWidth: number; offenders: string[] };


async function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];

    const insideScroller = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const { overflowX } = getComputedStyle(parent);
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") {
          return true;
        }
      }
      return false;
    };

    for (const element of document.body.querySelectorAll("*")) {
      const { right, width } = element.getBoundingClientRect();
      if (width > 0 && right > limit + 0.5 && !insideScroller(element)) {
        const classes = element.getAttribute("class")?.slice(0, 80) ?? "";
        offenders.push(`<${element.tagName.toLowerCase()} class="${classes}"\"> ends at "${Math.round(right)} px`);
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: limit,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function expectNoHorizontalScroll(page: Page, width: number) {
  const overflow = await measureOverflow(page);
  expect(
    overflow.scrollWidth,
    `${width} px: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}\n${overflow.offenders.join("\n")}`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}


async function expectTablesFit(page: Page, width: number) {
  for (const scroller of [
    page.locator('section[aria-label^="Renda fixa"] div.overflow-x-auto'),
    page.locator("aside div.overflow-x-auto"),
  ]) {
    const { clientWidth, scrollWidth } = await scroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scrollWidth, `${width} px: table has its own scrolling (${scrollWidth} > ${clientWidth})`).toBeLessThanOrEqual(
      clientWidth,
    );
  }
}

async function openSettings(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/configuracao?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio targets" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Cash percentage" })).toBeVisible();
  await waitForHydration(page);
}

test("settings do not scroll horizontally between 320 and 430 px", async ({ page }) => {
  for (const width of WIDTHS) {
    await openSettings(page, width);
    await expectNoHorizontalScroll(page, width);
    await expectTablesFit(page, width);
  }
});

test("invalid target totals still fit within the viewport", async ({ page }) => {
  for (const width of [320, 390]) {
    await openSettings(page, width);


    await page.getByRole("textbox", { name: "Cash percentage" }).fill("40");
    await page.getByRole("textbox", { name: "Crypto percentage" }).fill("10");
    await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();


    await expect(page.getByRole("complementary", { name: "Rebalancing preview" })).toBeHidden();
    await expectNoHorizontalScroll(page, width);
    await expectTablesFit(page, width);

    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("button", { name: "Discard" })).toHaveCount(0);
  }
});
