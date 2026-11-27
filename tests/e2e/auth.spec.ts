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
    await expect(page.getByRole("heading", { level: 1, name: "Holdings" })).toBeVisible();
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

  test("a new account requires sign-in and starts with an empty portfolio", async ({ page }) => {
    test.skip(!/^english099_[a-f0-9]+$/.test(new URL(process.env.DATABASE_URL ?? "postgresql://localhost/test").searchParams.get("schema") ?? ""), "Disposable database required");
    const email = `new-${crypto.randomUUID()}@portfolio.invalid`;
    const password = `Test!9${crypto.randomUUID()}`;
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Create an Account", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create an Account", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Account created.");
    await expect(page).toHaveURL(/\/entrar$/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Your portfolio is empty")).toBeVisible();
  });

});

test("settings show the account and sign-out button", async ({ page }) => {
  await stubQuoteChecks(page);
  await page.goto("/configuracao");
  const account = page.getByRole("region").filter({ hasText: testUser().email });
  await expect(account).toHaveCount(1);
  await expect(account.getByRole("button", { name: "Sign out" })).toBeVisible();
});
