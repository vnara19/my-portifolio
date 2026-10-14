import { expect, test, type Page } from "@playwright/test";

import { waitForHydration } from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});


async function openSettings(page: Page) {
  await page.goto("/configuracao?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio targets" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Cash percentage" })).toBeVisible();
  await waitForHydration(page);
}


async function touchGesture(page: Page, from: { x: number; y: number }, moves: { x: number; y: number }[]) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (const point of moves) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

function path(from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  return Array.from({ length: steps }, (_, index) => ({
    x: from.x + (dx * (index + 1)) / steps,
    y: from.y + (dy * (index + 1)) / steps,
  }));
}

async function discardIfPending(page: Page) {
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isVisible()) {
    await discard.click();
  }
  await expect(discard).toHaveCount(0);
}

test("target sliders move in one-percentage-point increments", async ({ page }) => {
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const original = await caixa.inputValue();
  const slider = page.getByRole("slider", { name: "Cash target" });
  await slider.scrollIntoViewIfNeeded();
  const thumb = await slider.boundingBox();
  if (!thumb) {
    throw new Error("Cash slider without a position on screen.");
  }

  const y = thumb.y + thumb.height / 2;
  const startX = thumb.x + thumb.width / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  const seen = new Set<string>();
  for (let step = 1; step <= 16; step += 1) {
    await page.mouse.move(startX + step * 3, y);
    seen.add(await caixa.inputValue());
  }
  await page.mouse.up();

  seen.delete(original);
  expect(seen.size).toBeGreaterThan(1);
  for (const value of seen) {
    expect(value, `valor ${value} ao arrastar`).toMatch(/^\d+$/);
  }

  const dragged = Number(await caixa.inputValue());
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue(String(dragged + 1));

  await discardIfPending(page);
  await expect(caixa).toHaveValue(original);
});

test("fractional typed targets persist until the slider moves", async ({ page }) => {
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const slider = page.getByRole("slider", { name: "Cash target" });

  await caixa.fill("15,5");
  await expect(slider).toHaveAttribute("aria-valuenow", "15.5");
  await expect(slider).toHaveAttribute("aria-valuetext", "15,5%");
  await expect(caixa).toHaveValue("15,5");

  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue("16");
  await page.keyboard.press("ArrowRight");
  await expect(caixa).toHaveValue("17");

  await caixa.fill("15,5");
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(caixa).toHaveValue("15");


  for (const [key, expected] of [
    ["Shift+ArrowRight", "25"],
    ["PageUp", "25"],
    ["Shift+ArrowLeft", "6"],
    ["PageDown", "6"],
  ] as const) {
    await caixa.fill("15,5");
    await slider.focus();
    await page.keyboard.press(key);
    await expect(caixa, key).toHaveValue(expected);
  }


  await caixa.fill("15,5");
  await slider.evaluate((input: HTMLInputElement) => {
    input.stepUp();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(caixa).toHaveValue("16");

  const tolerance = page.getByRole("textbox", { name: "Tolerance in percentage points" });
  const toleranceSlider = page.getByRole("slider", { name: "Tolerance band" });
  await tolerance.fill("2,25");
  await expect(toleranceSlider).toHaveAttribute("aria-valuenow", "2.25");
  await expect(tolerance).toHaveValue("2,25");
  await toleranceSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tolerance).toHaveValue("3");
  await page.keyboard.press("ArrowRight");
  await expect(tolerance).toHaveValue("4");

  await discardIfPending(page);
});

test("editing a target does not switch the preview tab", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "The preview is hidden on mobile (spec 080).");
  await openSettings(page);

  const preview = page.getByRole("complementary", { name: "Rebalancing preview" });
  const moeda = preview.getByRole("button", { name: "Currency", exact: true });
  await moeda.scrollIntoViewIfNeeded();
  await moeda.click();
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  await caixa.fill("20");
  await expect(page.getByText("1 group does not total 100%")).toBeVisible();
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  const estrategia = page.getByRole("slider", { name: "Core target", exact: true });
  await estrategia.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(moeda).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("slider", { name: "Tolerance band" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(moeda).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByRole("button", { name: "Class", exact: true })).toHaveAttribute("aria-pressed", "false");

  await discardIfPending(page);
  await expect(moeda).toHaveAttribute("aria-pressed", "true");
});

test("no spreadsheet reset or off-target count is exposed", async ({ page }) => {
  await openSettings(page);


  await expect(page.getByRole("button", { name: "Restore spreadsheet defaults" })).toHaveCount(0);
  await expect(page.getByText("Fora da meta")).toHaveCount(0);
  await expect(page.getByText("origem: Excel")).toHaveCount(0);
  const versions = page.getByRole("region", { name: "Versions", exact: true });
  await expect(versions.locator("[data-version-kind]").first()).toBeVisible();
  await expect(versions.locator('[data-version-kind]:not([data-version-kind="import"])')).toHaveCount(0);
  await expect(versions.getByText("vigente", { exact: true })).toHaveCount(0);
  await expect(versions.locator("li").filter({ hasNotText: "Backup imported" })).toHaveCount(0);
});


test("portfolio-wide currency targets are derived rather than editable", async ({ page }) => {
  await openSettings(page);

  const currency = page.getByRole("region", { name: "Currency", exact: true });
  await expect(currency.getByRole("textbox")).toHaveCount(0);
  await expect(currency.getByRole("slider")).toHaveCount(0);

  await expect(currency).not.toContainText("calculated by currency within each class");

  const brl = currency.getByLabel("Calculated BRL target");
  const before = await brl.textContent();
  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const current = Number((await caixa.inputValue()).replace(",", "."));
  await caixa.fill(String(current + 10).replace(".", ","));
  await expect(brl).not.toHaveText(before ?? "");

  await discardIfPending(page);
  await expect(brl).toHaveText(before ?? "");
});

test("vertical touch scrolling over a slider scrolls the page without changing the target", async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== "chromium", "Native CDP gesture: Chrome mobile only; Safari requires a real device.");
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const slider = page.getByRole("slider", { name: "Cash target" });
  const control = page.locator("[data-base-ui-slider-control]").filter({ has: slider });
  await caixa.fill("15,5");
  await slider.scrollIntoViewIfNeeded();

  for (const fraction of [0.15, 0.75]) {
    const box = await control.boundingBox();
    if (!box) {
      throw new Error("Cash slider without a position on screen.");
    }
    const before = await page.evaluate(() => window.scrollY);
    const from = { x: box.x + box.width * fraction, y: box.y + box.height / 2 };
    await touchGesture(page, from, path(from, 0, -180, 10));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 90);
    await expect(caixa).toHaveValue("15,5");
    await page.evaluate(() => window.scrollTo(0, 0));
    await slider.scrollIntoViewIfNeeded();
  }

  const thumb = await slider.boundingBox();
  const track = await control.boundingBox();
  if (!thumb || !track) {
    throw new Error("Cash slider without a position on screen.");
  }
  await page.touchscreen.tap(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.touchscreen.tap(track.x + track.width * 0.85, track.y + track.height / 2);
  await expect(caixa).toHaveValue("15,5");

  await discardIfPending(page);
});

test("horizontal touch dragging changes targets in one-point increments", async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== "chromium", "Native CDP gesture: Chrome mobile only; Safari requires a real device.");
  await openSettings(page);

  const caixa = page.getByRole("textbox", { name: "Cash percentage" });
  const slider = page.getByRole("slider", { name: "Cash target" });
  await caixa.fill("15,5");
  await slider.scrollIntoViewIfNeeded();
  const thumb = await slider.boundingBox();
  if (!thumb) {
    throw new Error("Cash slider without a position on screen.");
  }

  const from = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  const seen = new Set<string>();
  for (const point of path(from, 45, 2, 15)) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    seen.add(await caixa.inputValue());
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  seen.delete("15,5");
  expect(seen.size).toBeGreaterThan(1);
  for (const value of seen) {
    expect(value, `valor ${value} ao arrastar`).toMatch(/^\d+$/);
  }
  expect(Number(await caixa.inputValue())).toBeGreaterThan(15.5);

  await discardIfPending(page);
});
