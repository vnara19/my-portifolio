import { expect, test } from "@playwright/test";

import { positionRow } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";
import { competenceNav, waitForCompetenceHydration } from "./support/competence";


// Read-only behavior.
test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

test("breadcrumbs show positions and quotes; settings become an active tab", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const trail = page.getByTestId("nav-trail");
  const gear = page.getByRole("link", { name: "Portfolio settings" });

  await page.goto("/posicoes?mes=2026-09");
  await waitForCompetenceHydration(page);
  await expect(trail).toHaveCount(0);
  await expect(page.getByTestId("nav-island")).toHaveCount(0);

  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  await expect(trail).toHaveAttribute("data-kind", "position");
  await expect(trail).toContainText("You are in Porquinho");


  await expect(trail).not.toContainText("Positions");
  await expect(page.getByTestId("nav-trail-connectors")).toHaveCount(0);
  await expect(competenceNav(page)).toHaveAttribute("data-scoped", "true");
  await expect(nav.getByRole("link", { name: "Positions" })).toHaveAttribute("aria-current", "page");

  const navBox = await nav.boundingBox();
  const trailBox = await trail.boundingBox();
  expect(trailBox!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);

  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await expect(trail).toHaveAttribute("data-kind", "quotes");
  await expect(trail).toContainText("Quotes · Sep/26");

  await expect(competenceNav(page)).not.toHaveAttribute("data-scoped", "true");
  await expect(gear).toBeVisible();

  await page.goto("/configuracao?mes=2026-09");
  await expect(trail).toHaveCount(0);
  const settings = nav.getByTestId("settings-tab");
  await expect(settings).toHaveAttribute("aria-current", "page");
  await expect(settings).toContainText("Settings");
  await expect(gear).toHaveCount(0);
  await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
});

test("tabs and breadcrumbs fit narrow screens", async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 760 });
    for (const path of ["/posicoes/cotacoes?mes=2026-09", "/configuracao?mes=2026-09"]) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByRole("link", { name: "Positions" })).toBeVisible();
      const scroller = await nav.evaluate((element) => {
        const parent = element.parentElement as HTMLElement;
        return { clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth };
      });
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);

      const header = await page.locator("header").first().evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(header).toBeLessThanOrEqual(0);
    }
  }
});
