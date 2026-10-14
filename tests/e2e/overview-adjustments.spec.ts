import { expect, type Locator, type Page, test } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

function parseShare(text: string) {
  return Number(text.replace("%", "").replace(/\./g, "").replace(",", ".").trim());
}

async function columnShares(table: Locator, column: number) {
  const cells = await table.locator(`tbody tr > :nth-child(${column})`).allTextContents();
  return cells.map(parseShare);
}

async function columnSum(table: Locator, column: number) {
  return (await columnShares(table, column)).reduce((sum, share) => sum + share, 0);
}

async function pageWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test("all-time change replaces the off-target metric", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const kpis = page.getByRole("region", { name: "Reporting month metrics" });
  const periodCard = kpis.locator("article").filter({ hasText: "All-time change" });
  await expect(periodCard).toBeVisible();
  await expect(kpis.getByText("Fora da meta")).toHaveCount(0);


  // Full allocation view (spec 030).
  await expect(page.getByTestId("period-change")).toHaveAttribute("data-value", /^\+[\d.]+(,\d{1,2})?%$/);
  await expect(page.getByTestId("period-change")).toHaveClass(/text-primary/);
  await expect(periodCard.locator("p").last()).toHaveText(/^R\$\s[\d.]+,\d{2} desde Out\/23$/);

  await page.goto("/?mes=2023-10");
  await expect(page.getByTestId("period-change")).toHaveText("—");
  await expect(periodCard.locator("p").last()).toHaveText("Period start");

  await page.goto("/?mes=2023-06");
  await expect(page.getByTestId("period-change")).toHaveText("—");
  await expect(periodCard.locator("p").last()).toHaveText("The period starts in Oct/23");
});

test("changes compare calendar months", async ({ page }) => {
  const kpis = page.getByRole("region", { name: "Reporting month metrics" });
  const detail = (title: string) => kpis.locator("article").filter({ hasText: title }).locator("p").last();

  await page.goto("/?mes=2026-09");
  await expect(detail("Monthly change")).toHaveText(/^R\$\s[\d.]+,\d{2}$/);
  await expect(detail("12-month change")).toHaveText(/ desde Set\/25$/);


  await page.goto("/?mes=2024-08");
  await expect(detail("Monthly change")).toHaveText(/R\$\s[\d.]+,\d{2}$/);
  await expect(detail("12-month change")).toHaveText(/ desde Ago\/23$/);


  await page.goto("/?mes=2024-05");
  await expect(page.getByTestId("year-change")).toHaveText("—");
  await expect(detail("12-month change")).toHaveText("Insufficient history");


  await page.goto("/?mes=2024-06");
  await expect(detail("12-month change")).toHaveText(/ desde Jun\/23$/);

  await page.goto("/?mes=2023-06");
  await expect(detail("Monthly change")).toHaveText("First reporting month in history");
});

test("a target without a position appears as a purchase opportunity", async ({ page }) => {
  await page.goto("/?mes=2024-03&corte=renda-fixa");
  const panel = page.getByRole("region", { name: "Buy and sell" });
  const row = panel.getByRole("row").filter({ hasText: "IPCA · Curto" });
  await expect(row).toContainText("0,0%");
  await expect(row).toContainText("10,0%");
  await expect(row).toContainText("-R$");
  await expect(panel.getByText(/Comprar · \d+/)).toBeVisible();
});

test("overview fits the viewport width", async ({ page }) => {

  await page.goto("/?mes=2026-09&corte=renda-fixa");

  await expect(page.getByRole("region", { name: "Buy and sell" })).toBeVisible();
  await expect(
    page.getByTestId("duration-current").locator(".recharts-bar-rectangle").first(),
  ).toBeVisible();

  expect(await pageWidth(page)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test("fixed income by redemption term uses the same scale for current and target values", async ({ page }) => {
  await page.goto("/?mes=2026-09&corte=renda-fixa");

  const card = page.getByRole("region", { name: "Fixed income by redemption term" });
  await card.scrollIntoViewIfNeeded();

  const legend = card.getByRole("list", { name: "Prazos" });
  for (const duration of ["Short-term", "Medium-term", "Long-term"]) {
    await expect(legend.getByText(duration, { exact: true })).toBeVisible();
  }

  const current = card.getByTestId("duration-current");
  const target = card.getByTestId("duration-target");
  await expect(current.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(target.locator(".recharts-bar-rectangle").first()).toBeVisible();


  // Current allocation above; target allocation below.
  const currentBox = (await current.boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  const sideBySide = (page.viewportSize()?.width ?? 0) >= 1024;
  expect(
    sideBySide ? currentBox.x + currentBox.width <= targetBox.x && Math.abs(currentBox.y - targetBox.y) < 2 : currentBox.y + currentBox.height <= targetBox.y,
  ).toBe(true);

  const ticks = (chart: Locator) =>
    chart.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").allTextContents();
  const categories = (chart: Locator) =>
    chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents();
  expect(await ticks(current)).toEqual(await ticks(target));
  expect(await categories(current)).toEqual(await categories(target));
  await expect(current.locator(".recharts-label-list text").first()).toBeVisible();

  const table = card.getByRole("table", { name: "Fixed income by redemption term, current and target" });
  expect(Math.abs((await columnSum(table, 3)) - 100)).toBeLessThan(0.5);
  expect(Math.abs((await columnSum(table, 4)) - 100)).toBeLessThan(0.5);
});

test("nonstandard terms occupy the same location in both charts", async ({ page }) => {


  // The legacy "Nenhum" key denotes no redemption term.
  await page.goto("/?mes=2025-10&corte=renda-fixa");

  const card = page.getByRole("region", { name: "Fixed income by redemption term" });
  await card.scrollIntoViewIfNeeded();

  const legend = card.getByRole("list", { name: "Prazos" });
  await expect(legend.getByText("Short-term", { exact: true })).toBeVisible();
  test.skip(
    (await legend.getByText("No term", { exact: true }).count()) === 0,
    "No fixed-income position without a term in Oct/25 fixture data.",
  );

  const current = card.getByTestId("duration-current");
  const target = card.getByTestId("duration-target");
  const legendCount = await legend.getByRole("listitem").count();
  await expect(current.locator(".recharts-bar")).toHaveCount(legendCount);
  await expect(target.locator(".recharts-bar")).toHaveCount(legendCount);


  await expect(current.locator(".recharts-label-list text").first()).toBeVisible();
  await expect(target.locator(".recharts-label-list text").first()).toBeVisible();

  const longBarsX = (chart: Locator) =>
    chart
      .locator(".recharts-bar")
      .nth(2)
      .locator(".recharts-bar-rectangle path")
      .evaluateAll((paths) => paths.map((path) => Math.round(path.getBoundingClientRect().x)));
  const currentLongX = await longBarsX(current);
  expect(currentLongX).toHaveLength(2);
  expect(await longBarsX(target)).toEqual(currentLongX);
});

test("every fixed-income bar has a label at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?mes=2026-09&corte=renda-fixa");

  const card = page.getByRole("region", { name: "Fixed income by redemption term" });
  await card.scrollIntoViewIfNeeded();

  const table = card.getByRole("table", { name: "Fixed income by redemption term, current and target" });
  const filled = async (column: number) =>
    (await columnShares(table, column)).filter((share) => share > 0).length;
  const labels = (mode: string) => card.getByTestId(`duration-${mode}`).locator(".recharts-label-list text");

  await expect(labels("current")).toHaveCount(await filled(3));
  await expect(labels("target")).toHaveCount(await filled(4));
  expect(await pageWidth(page)).toBeLessThanOrEqual(360);
});

test("cards respond to pointer movement like metric cards", async ({ page }) => {
  await page.goto("/?mes=2026-09");

  const hoverable = await page.evaluate(() => matchMedia("(hover: hover)").matches);
  const kpi = page.getByRole("region", { name: "Reporting month metrics" }).locator("article").first();
  const panel = page.locator("#evolucao");
  const style = (locator: Locator, property: "transform" | "borderTopColor") =>
    locator.evaluate((element, name) => getComputedStyle(element)[name], property);
  const settled = (locator: Locator) =>
    locator.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
  const documentTop = (locator: Locator) =>
    locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);


  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  await settled(panel);
  const panelBorder = await style(panel, "borderTopColor");
  await kpi.hover();

  if (!hoverable) {
    await expect.poll(() => style(kpi, "transform")).toBe("none");
    return;
  }


  await expect
    .poll(async () => {
      await kpi.hover();
      return style(kpi, "transform");
    })
    .toBe("matrix(1, 0, 0, 1, 0, -1)");


  const panelTop = await documentTop(panel);
  await panel.hover();
  await expect.poll(() => style(panel, "borderTopColor")).not.toBe(panelBorder);
  await settled(panel);
  expect(await documentTop(panel)).toBeCloseTo(panelTop, 0);

  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await kpi.hover();
  await expect.poll(() => style(kpi, "transform")).toBe("none");
});

test("mobile buy/sell preview shows only the item and difference", async ({ page }) => {

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mes=2026-09");

  const panel = page.getByRole("region", { name: "Buy and sell" });
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByRole("columnheader", { name: "Item" })).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "Difference" })).toBeVisible();
  for (const hidden of ["Current %", "Target %", "Current BRL", "Target BRL"]) {
    await expect(panel.getByRole("columnheader", { name: hidden })).toBeHidden();
  }
  expect(await pageWidth(page)).toBeLessThanOrEqual(390);
});
