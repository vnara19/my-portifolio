import { expect, test } from "@playwright/test";

import { SIGNED_OUT, testUser } from "./support/auth";
import { stubQuoteChecks } from "./support/quote-checks";


test.describe("without a session", () => {
  test.use({ storageState: SIGNED_OUT });

  test("pages redirect to sign-in and return to the requested URL", async ({ page }) => {
    await stubQuoteChecks(page);
    await page.goto("/posicoes");
    await expect(page).toHaveURL(/\/entrar\?para=%2Fposicoes$/);
    await expect(page.getByRole("heading", { name: "My portfolio" })).toBeVisible();

    const { email, password } = testUser();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/posicoes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Monthly portfolio" })).toBeVisible();
  });

  test("an incorrect password shows an error without signing in", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(testUser().email);
    await page.getByLabel("Password").fill("senha-incorreta-do-teste");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("data routes return 401", async ({ request }) => {
    expect((await request.get("/api/backup")).status()).toBe(401);
    const check = await request.post("/api/quotes/open-check", { data: {} });
    expect(check.status()).toBe(401);
  });

  test("an email outside the allowlist cannot create an account", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Name").fill("Visitante");
    await page.getByLabel("Email").fill("visitante@exemplo.test");
    await page.getByLabel("Password").fill("senha-de-visitante-123");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("is not allowed to create an account");
  });
});

test("settings show the account and sign-out button", async ({ page }) => {
  await stubQuoteChecks(page);
  await page.goto("/configuracao");
  const account = page.getByRole("region").filter({ hasText: testUser().email });
  await expect(account).toHaveCount(1);
  await expect(account.getByRole("button", { name: "Sign out" })).toBeVisible();
});
