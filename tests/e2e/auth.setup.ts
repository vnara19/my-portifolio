import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE, testUser } from "./support/auth";
import { stubQuoteChecks } from "./support/quote-checks";


setup("signs in with the isolated test user", async ({ page }) => {
  const { email, password } = testUser();
  await stubQuoteChecks(page);

  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: AUTH_STATE });
});
