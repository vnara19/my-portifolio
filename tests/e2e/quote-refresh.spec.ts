import { expect, test } from "@playwright/test";

import { stubQuoteChecks, stubRun as run, stubSummary as summary } from "./support/quote-checks";

const MINUTE = 60 * 1000;

test("the header shows the last successful quote update", async ({ page }, testInfo) => {
  const lastRun = run();
  await stubQuoteChecks(page, { openCheck: { summary: summary(lastRun, lastRun.finishedAt) } });
  await page.goto("/");

  const indicator = page.getByTestId("quote-refresh");
  await expect(indicator).toHaveAccessibleName("Updated 5 min ago");

  if (testInfo.project.name.startsWith("mobile")) {
    await expect(indicator).toContainText("5 min");
  } else {
    await expect(indicator.getByText("Updated 5 min ago")).toBeVisible();
  }

  await expect(page.getByTestId("quote-refresh-issue")).toHaveCount(0);
  await expect(page.getByTestId("app-toast")).toHaveCount(0);
});

test("each failed quote announces its asset", async ({ page }) => {
  const failed = run({
    status: "COMPLETED_WITH_ISSUES",
    succeeded: 8,
    failures: [
      {
        symbol: "BTC",
        assets: ["Bitcoin 01", "Bitcoin 02"],
        provider: "coingecko",
        errorCode: "RATE_LIMITED",
        errorMessage: "The provider rejected the request due to rate limiting (HTTP 429).",
      },
      {
        symbol: "VOO",
        assets: ["ETF - VOO"],
        provider: "finnhub",
        errorCode: "TIMEOUT",
        errorMessage: "The provider timed out.",
      },
    ],
  });
  await stubQuoteChecks(page, {
    openCheck: { summary: summary(failed, failed.finishedAt) },
  });
  await page.goto("/posicoes");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("2 quotes not updated");
  await expect(toast).toContainText("As outras 8 foram atualizadas.");
  await expect(toast).toContainText("BTC");
  await expect(toast).toContainText("Bitcoin 01, Bitcoin 02");
  await expect(toast).toContainText("CoinGecko: The provider rejected too many requests (HTTP 429).");
  await expect(toast).toContainText("VOO");
  await expect(toast).toContainText("Finnhub: The provider timed out.");
  await expect(page.getByTestId("quote-refresh-issue")).toBeVisible();
  await expect(page.getByTestId("quote-refresh")).toHaveAccessibleName(/Last attempt failed: BTC, VOO/);


  await toast.locator('button[aria-label="Fechar aviso"]').click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
});


test("no production month offers manual refresh", async ({ page }, testInfo) => {
  const lastRun = run();
  await stubQuoteChecks(page, { openCheck: { summary: summary(lastRun, lastRun.finishedAt) } });

  for (const path of ["/", "/?mes=2026-09", "/posicoes/cotacoes"]) {
    await page.goto(path);
    const indicator = page.getByTestId("quote-refresh");
    await expect(indicator).toContainText(testInfo.project.name.startsWith("mobile") ? "5 min" : "Updated 5 min ago");


    await expect(page.getByRole("button", { name: /Refresh quotes(?! \(dev\))/ })).toHaveCount(0);


    await page.waitForLoadState("networkidle");
  }


  await expect(page.getByRole("region", { name: "Last update" })).toContainText(
    "Quotes are updated automatically every hour",
  );
  await page.goto("/posicoes/cotacoes?mes=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly quotes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Last update" })).toHaveCount(0);

  const response = await page.request.post("/api/quotes/refresh", { data: {} });
  expect(response.status()).toBe(404);
});


test("the header follows the latest job without showing a false updating state", async ({ page }, testInfo) => {
  const fresh = run({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
  await stubQuoteChecks(page, { openCheck: { summary: summary(fresh, fresh.finishedAt) }, delayMs: 1500 });
  await page.goto("/");

  const indicator = page.getByTestId("quote-refresh");
  await expect(indicator).not.toHaveAttribute("aria-busy");
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(indicator.getByText("Updating quotes…")).toHaveCount(0);
  }

  await expect(indicator).toHaveAccessibleName("Updated just now");

  await expect(page.getByTestId("app-toast")).toHaveCount(0);
});


test("execution failures are announced only once", async ({ page }) => {
  const failed = run({
    id: "00000000-0000-4000-8000-000000000009",
    status: "COMPLETED_WITH_ISSUES",
    succeeded: 9,
    failures: [
      {
        symbol: "VOO",
        assets: ["ETF - VOO"],
        provider: "finnhub",
        errorCode: "TIMEOUT",
        errorMessage: "The provider timed out.",
      },
    ],
  });
  await stubQuoteChecks(page, { openCheck: { summary: summary(failed, failed.finishedAt) } });
  await page.goto("/");

  await expect(page.getByTestId("app-toast")).toContainText("VOO quote not updated");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();

  await expect(page.getByTestId("quote-refresh")).toHaveAccessibleName(/Last attempt failed: VOO/);
  await expect(page.getByTestId("app-toast")).toHaveCount(0);

  await expect(page.getByTestId("quote-refresh-issue")).toBeVisible();
});

test("write failures identify each asset", async ({ page }) => {
  const failed = run({
    status: "FAILED",
    succeeded: 0,
    errorMessage: "Quotes were fetched but could not be saved.",
    failures: ["BTC", "VOO"].map((symbol) => ({
      symbol,
      assets: [symbol === "BTC" ? "Bitcoin 01" : "ETF - VOO"],
      provider: symbol === "BTC" ? "coingecko" : "finnhub",
      errorCode: "NOT_SAVED",
      errorMessage: "The quote was fetched but could not be saved.",
    })),
  });
  await stubQuoteChecks(page, {
    openCheck: { summary: summary(failed, null) },
  });
  await page.goto("/");

  const toast = page.getByTestId("app-toast");
  await expect(toast).toContainText("2 quotes not updated");
  await expect(toast).toContainText("Assets retain their previous values.");
  await expect(toast).toContainText("Bitcoin 01");
  await expect(toast).toContainText("Finnhub: The quote was fetched but could not be saved.");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();
});

test("automatic checks announce an unresponsive application", async ({ page }) => {
  await stubQuoteChecks(page);
  await page.route("**/api/quotes/open-check", (route) => route.fulfill({ status: 500, body: "erro" }));
  await page.goto("/posicoes");

  await expect(page.getByTestId("app-toast")).toContainText("Could not check the quotes");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
});


test("the update indicator does not clip tabs on narrow screens", async ({ page }) => {

  test.setTimeout(120_000);
  const labels = [
    { lastUpdatedAt: "2026-09-30T07:39:00.000Z", widths: [320, 360, 375, 640, 768, 1024] },
    { lastUpdatedAt: new Date(Date.now() - 59 * MINUTE).toISOString(), widths: [320, 360] },
  ];

  for (const { lastUpdatedAt, widths } of labels) {
    const lastRun = run({ startedAt: lastUpdatedAt, finishedAt: lastUpdatedAt });
    await page.unrouteAll();
    await stubQuoteChecks(page, {
      openCheck: { summary: summary(lastRun, lastUpdatedAt) },
    });


    for (const [width, path] of widths.flatMap((width) => ["/posicoes", "/posicoes?mes=2026-09"].map((path) => [width, path] as const))) {
      await page.setViewportSize({ width, height: 760 });
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(page.getByTestId("quote-refresh")).toContainText(/\d/);
      await expect(page.getByRole("link", { name: "Positions" })).toBeVisible();
      await page.waitForLoadState("networkidle");


      // Check pixel dimensions.
      await expect
        .poll(
          () =>
            nav.evaluate((element) => {
              const parent = element.parentElement as HTMLElement;
              return parent.scrollWidth - parent.clientWidth;
            }),
          { message: `tabs clipped at ${width} px (${path})` },
        )
        .toBeLessThanOrEqual(0);
    }
  }
});
