import { expect, type Locator, type Page } from "@playwright/test";


export const competenceNav = (page: Page) => page.getByRole("navigation", { name: "Reporting months", includeHidden: true });

export const competenceTrigger = (page: Page) => page.getByTestId("month-trigger");
export const competenceSheet = (page: Page) => page.getByTestId("month-sheet");


export async function waitForCompetenceHydration(page: Page) {
  await expect(competenceNav(page)).toHaveAttribute("data-hydrated");
}


export const usesCompetenceSheet = (page: Page) => competenceTrigger(page).isVisible();


export async function expectCompetence(page: Page, name: string) {
  if (await usesCompetenceSheet(page)) {
    await expect(competenceTrigger(page)).toHaveAccessibleName(`Reporting month: ${name}`);
    return;
  }

  await expect(competenceNav(page).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-current", "date");
}


export async function openCompetenceSheet(page: Page) {
  await competenceTrigger(page).click();
  await expect(competenceSheet(page)).toBeVisible();
  await expect(competenceSheet(page)).not.toHaveAttribute("data-starting-style");
}


export async function competenceYear(page: Page, year: number): Promise<Locator> {
  const scope = (await usesCompetenceSheet(page)) ? page.getByTestId("month-sheet-years") : competenceNav(page);

  return scope.getByRole("button", { name: new RegExp(`^${year}`) });
}


export async function chooseCompetence(page: Page, name: string) {
  const year = Number(name.slice(-4));
  const sheet = await usesCompetenceSheet(page);

  if (sheet) {
    await openCompetenceSheet(page);
  }

  const yearButton = (await competenceYear(page, year)).first();
  const opened = sheet ? await yearButton.getAttribute("aria-pressed") : await yearButton.getAttribute("aria-expanded");

  if (opened !== "true") {
    await yearButton.click();
  }

  const scope = sheet ? competenceSheet(page) : competenceNav(page);
  await scope.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}


export async function expectNoCompetenceYear(page: Page, year: number) {
  const sheet = await usesCompetenceSheet(page);

  if (sheet) {
    await openCompetenceSheet(page);
  }

  await expect(await competenceYear(page, year)).toHaveCount(0);

  if (sheet) {
    await competenceSheet(page).getByRole("button", { name: "Close" }).click();
    await expect(competenceSheet(page)).toHaveCount(0);
  }
}
