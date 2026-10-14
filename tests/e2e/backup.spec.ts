import { expect, test, type Page } from "@playwright/test";

import { stubQuoteChecks } from "./support/quote-checks";


test.beforeEach(async ({ page }) => {
  await stubQuoteChecks(page);
});

async function downloadBackup(page: Page) {
  const response = await page.request.get("/api/backup");
  expect(response.status()).toBe(200);
  return { response, backup: (await response.json()) as { format: string; version: number; tables: Record<string, unknown[]> } };
}

function backupPanel(page: Page) {
  return page.getByRole("region", { name: "Data backup" });
}

test("exports all portfolio data in one file", async ({ page }) => {
  const { response, backup } = await downloadBackup(page);

  expect(response.headers()["content-disposition"]).toMatch(
    /^attachment; filename="meu-portfolio-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json"$/,
  );
  expect(backup.format).toBe("meu-portfolio-backup");
  expect(backup.version).toBe(5);


  // (spec 052).
  expect(Object.keys(backup.tables)).toContain("dataImports");
  expect(Object.keys(backup.tables)).toContain("manualQuotes");
  expect(Object.keys(backup.tables)).toContain("positionTransactions");
  expect(Object.keys(backup.tables)).not.toContain("importBatches");
  expect(Object.keys(backup.tables)).not.toContain("quoteRefreshRuns");
  expect(backup.tables.positions.every((row) => !("userId" in (row as object)))).toBe(true);
  expect(backup.tables.portfolioMonths.length).toBeGreaterThan(0);
  expect(backup.tables.positions.length).toBeGreaterThan(0);
  expect(backup.tables.targetPlans.length).toBeGreaterThan(0);

  await page.goto("/configuracao");
  await expect(backupPanel(page).getByRole("link", { name: "Export backup" })).toHaveAttribute("href", "/api/backup");
});

test("validates a backup, shows its summary and cancels without writing", async ({ page }) => {
  const { backup } = await downloadBackup(page);

  await page.goto("/configuracao");
  await backupPanel(page)
    .getByLabel("Backup file")
    .setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });

  const dialog = page.getByRole("dialog", { name: "Import this backup?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row", { name: /^Posições/ })).toContainText(
    backup.tables.positions.length.toLocaleString("pt-BR"),
  );
  await expect(dialog.getByRole("row", { name: /^Competências/ })).toContainText(
    backup.tables.portfolioMonths.length.toLocaleString("pt-BR"),
  );

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("rejects a file that is not a backup", async ({ page }) => {
  await page.goto("/configuracao");
  const panel = backupPanel(page);

  await panel
    .getByLabel("Backup file")
    .setInputFiles({ name: "outro.json", mimeType: "application/json", buffer: Buffer.from('{"format":"outro"}') });
  await expect(panel.getByRole("alert")).toHaveText("The file is not a backup from this application.");

  await panel
    .getByLabel("Backup file")
    .setInputFiles({ name: "texto.json", mimeType: "application/json", buffer: Buffer.from("not JSON") });
  await expect(panel.getByRole("alert")).toHaveText("texto.json is not a valid backup file.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
