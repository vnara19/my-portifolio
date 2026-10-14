import { expect, test, type Locator, type Page } from "@playwright/test";

import type { TickerCheckRequest, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";

import {
  chooseKind, closeForm, continueForm, expectFormStep, formTab, issueCount,
  openAddForm, openEditableMonth, openEditForm, openPositionPage, pick, positionRow,
} from "./support/position-form";
import { stubQuoteChecks } from "./support/quote-checks";
import { waitForCompetenceHydration } from "./support/competence";


test.beforeEach(async ({ page }) => { await stubQuoteChecks(page); });
const TOKEN = "test-ticker-check-not-used-for-saving";

async function stubTickerCheck(page: Page, respond: (request: TickerCheckRequest, attempt: number) => TickerCheckResponse | "fail") {
  const requests: TickerCheckRequest[] = [];
  await page.route("**/api/quotes/ticker-check", async (route) => {
    const body = route.request().postDataJSON() as TickerCheckRequest;
    requests.push(body);
    const response = respond(body, requests.length);
    await route.fulfill(response === "fail"
      ? { status: 500, json: { message: "Could not verify the ticker right now." } }
      : { json: response });
  });
  return requests;
}
function found(ticker: string, provider: string, priceBrl: number, name: string | null = null): TickerCheckResponse {
  return { status: "found", symbol: ticker, provider, priceBrl, name, quoteDate: "2026-10-02", token: TOKEN };
}
async function openPositions(page: Page) {
  test.skip(!(await openEditableMonth(page)), "No open month in the available data.");
}
async function toAssetStep(page: Page, dialog: Locator, kind: RegExp) {
  await chooseKind(page, dialog, kind);
  await pick(page, dialog.getByRole("combobox", { name: "Institution" }), "inter", /^Inter$/);
  await continueForm(dialog, "Asset");
}

test("position creation requires every step and offers saving only after review", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await expectFormStep(dialog, "Position");
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Asset name" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add position", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Position");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Choose the type");
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Asset");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("asset name");
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("CDB Teste 2099");
  await dialog.getByRole("textbox", { name: "Balance (BRL)" }).fill("1500,25");
  await continueForm(dialog, "Allocation");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Allocation");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Choose class, subclass and redemption term from the list");
  await dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Redemption term of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "Long-term", exact: true }).click();
  await continueForm(dialog, "Review");
  await expect(dialog.getByRole("heading", { name: "Review your new position" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add position", exact: true })).toBeVisible();
  await expect(dialog).toContainText("R$ 1.500,25");
  if (test.info().project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/dialog-e2e/position-review-iphone.png" });
  }
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expectFormStep(dialog, "Allocation");
  await closeForm(dialog);
  await expect(page.getByRole("row").filter({ hasText: "CDB Teste 2099" })).toHaveCount(0);
});

test("closed months offer no add, edit or delete action", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await expect(page.getByTestId("month-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add position" })).toHaveCount(0);
  await expect(positionRow(page, "Bitcoin 01").getByRole("button", { name: /^(Movimentar|Liquidar|Editar|Remover) / })).toHaveCount(0);

  await openPositionPage(page, "Bitcoin 01");
  await expect(page.getByRole("button", { name: "Edit position" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});

test("institutions accept new values and manual fixed income hides CDI calculations", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /Renda fixa/);
  const institution = dialog.getByRole("combobox", { name: "Institution" });
  await institution.click();
  await page.keyboard.type("itau");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Itaú" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Corretora Teste");
  await page.getByRole("option", { name: "Criar “Corretora Teste”" }).click();
  await expect(institution).toHaveValue("Corretora Teste");
  await continueForm(dialog, "Asset");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Maturity", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Percentual do CDI" })).toHaveCount(0);
  await expect(dialog.getByLabel("Investment date")).toHaveCount(0);
  await closeForm(dialog);
});

test("verified tickers calculate value; missing tickers block continuation", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ticker === "LINK"
    ? found("LINK", "coingecko", 10000, "Chainlink")
    : { status: "not-found", symbol: ticker, provider: "coingecko", message: `Could not find ticker ${ticker}.` });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Cripto/);
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Chainlink");
  await dialog.getByRole("textbox", { name: "Quantity" }).fill("0,5");
  await ticker.click();
  await page.keyboard.type("link");
  await expect(ticker).toHaveValue("LINK");
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(status).toContainText("LINK encontrado (Chainlink)");
  expect(requests.filter((request) => request.ticker.startsWith("L"))).toEqual([expect.objectContaining({ kind: "crypto", ticker: "LINK" })]);
  if ((await status.textContent())?.includes("Enter the quote")) await dialog.getByRole("textbox", { name: "Quote in BRL" }).fill("10000");
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 5.000,00");
  await continueForm(dialog, "Allocation");
  await expect(dialog.getByRole("combobox", { name: "Class of allocation 1", exact: true })).toHaveValue("Crypto");
  await expect(dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true })).toHaveValue("Altcoin");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await continueForm(dialog, "Review");
  await expect(dialog).toContainText("R$ 5.000,00");
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await ticker.fill("ZZZ");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Asset");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Confira o ticker");
  await closeForm(dialog);
});

test("an unavailable provider allows continuation only with a manual quote", async ({ page }) => {
  await stubTickerCheck(page, () => ({ status: "unavailable", symbol: "QQQ", provider: "finnhub", code: "NETWORK_ERROR", message: "Could not connect to the provider.", token: TOKEN }));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Invesco Teste");
  await dialog.getByRole("textbox", { name: "Quantity" }).fill("2");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");
  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "unavailable");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Asset");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("quote in BRL");
  await dialog.getByRole("textbox", { name: "Quote in BRL" }).fill("2550");
  await continueForm(dialog, "Allocation");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");
  await closeForm(dialog);
});

test("B3 verification requires a complete ticker and stores the SAO suffix", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ({ status: "not-found", symbol: ticker, provider: "yahoo", message: `Could not find ${ticker}.` }));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF da B3/);
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await ticker.fill("BOVA");
  await expect(status).toContainText("Digite o ticker completo");
  expect(requests).toHaveLength(0);
  await ticker.fill("bova11");
  await expect(status).toHaveAttribute("data-ticker-status", "not-found");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ kind: "br-etf", ticker: "BOVA11.SAO" }));
  await closeForm(dialog);
});

test("allocation weights must total 100% before review", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("CDB Teste 2099");
  await dialog.getByRole("textbox", { name: "Balance (BRL)" }).fill("1500,25");
  await continueForm(dialog, "Allocation");
  await dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "IPCA", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Redemption term of allocation 1", exact: true }).click();
  await page.getByRole("option", { name: "Long-term", exact: true }).click();
  await dialog.getByRole("button", { name: "Add classification" }).click();
  await expect(dialog.getByRole("textbox", { name: "Weight of allocation 2" })).toHaveValue("0");
  await dialog.getByRole("textbox", { name: "Weight of allocation 1" }).fill("60");
  await dialog.getByRole("textbox", { name: "Weight of allocation 2" }).fill("30");
  await expect(dialog.getByText("Soma: 90% · faltam 10%")).toBeVisible();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Allocation");
  await dialog.getByRole("button", { name: "Remove allocation 2" }).click();
  await dialog.getByRole("textbox", { name: "Weight of allocation 1" }).fill("100");
  await continueForm(dialog, "Review");
  await closeForm(dialog);
});

test("an existing quote computes value; a conflicting provider blocks the symbol", async ({ page }) => {
  const requests = await stubTickerCheck(page, ({ ticker }) => ticker === "VOO"
    ? { status: "known", symbol: "VOO", priceBrl: 3000 }
    : { status: "conflict", symbol: ticker, message: `${ticker} is already quoted in the portfolio by another provider (CoinGecko). Choose the corresponding type.` });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Vanguard Teste");
  await dialog.getByRole("textbox", { name: "Quantity" }).fill("2");
  const ticker = dialog.getByRole("textbox", { name: "Ticker" });
  const status = dialog.locator("[data-ticker-status]");
  await ticker.fill("VOO");
  await expect(status).toHaveAttribute("data-ticker-status", "known");
  await expect(status).toContainText("VOO already has a quote in this reporting month");
  await expect(dialog.getByRole("textbox", { name: "Quote in BRL" })).toHaveCount(0);
  await expect(dialog.getByTestId("position-form-total")).toContainText("R$ 6.000,00");
  await ticker.fill("BTC");
  await expect(status).toHaveAttribute("data-ticker-status", "conflict");
  await expect(status).toContainText("outro provedor");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Asset");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Confira o ticker");
  expect(requests.map((request) => request.ticker)).toEqual(["VOO", "BTC"]);
  await closeForm(dialog);
});

test("verification failures allow retry without losing entered fields", async ({ page }) => {
  const requests = await stubTickerCheck(page, (_request, attempt) => attempt === 1 ? "fail" : found("QQQ", "finnhub", 2550));
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /ETF dos EUA/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Invesco Teste");
  await dialog.getByRole("textbox", { name: "Quantity" }).fill("2");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("QQQ");
  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toHaveAttribute("data-ticker-status", "error");
  await status.getByRole("button", { name: "Try again" }).click();
  await expect(status).toHaveAttribute("data-ticker-status", "found");
  await expect(dialog.getByRole("textbox", { name: "Asset name" })).toHaveValue("Invesco Teste");
  await expect(dialog.getByRole("textbox", { name: "Quantity" })).toHaveValue("2");
  expect(requests).toHaveLength(2);
  await closeForm(dialog);
});

test("existing assets are reused; another maturity creates a new identity", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await chooseKind(page, dialog, /USD cash/);
  await pick(page, dialog.getByRole("combobox", { name: "Institution" }), "itau", /^Itaú$/);
  await continueForm(dialog, "Asset");
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Time Deposit");
  await dialog.getByRole("textbox", { name: "Balance (USD)" }).fill("1");
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("Time Deposit already exists");
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("Asset liquidity")).toBeVisible();

  await dialog.getByRole("textbox", { name: "Maturity", exact: true }).fill("15/01/2027");
  await expect(existing).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Liquidity" })).toBeVisible();
  await closeForm(dialog);
});

test("fixed income with an existing name is reused only at its institution", async ({ page }) => {
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Renda fixa/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("LCI BRB - Set/26");
  await dialog.getByRole("textbox", { name: "Balance (BRL)" }).fill("100");
  const existing = dialog.locator("[data-asset-existing]");
  await expect(existing).toContainText("LCI BRB - Set/26 already exists");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expectFormStep(dialog, "Asset");
  await expect(dialog.getByTestId("position-form-issue")).toContainText("This asset already has a position at this institution.");
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await pick(page, dialog.getByRole("combobox", { name: "Institution" }), "itau", /^Itaú$/);
  await continueForm(dialog, "Asset");
  await expect(existing).toHaveCount(0);
  await closeForm(dialog);
});

test("ambiguous crypto tickers allow selecting the correct coin", async ({ page }) => {
  const coins = [{ id: "uniswap", name: "Uniswap" }, { id: "unicorn-token", name: "Unicorn Token" }];
  const requests = await stubTickerCheck(page, ({ ticker, coinId }) => {
    const coin = coins.find((candidate) => candidate.id === coinId) ?? coins[0];
    return { ...found(ticker, "coingecko", coin.id === "uniswap" ? 40 : 0.5, coin.name), coinId: coin.id, coins };
  });
  await openPositions(page);
  const dialog = await openAddForm(page);
  await toAssetStep(page, dialog, /Cripto/);
  await dialog.getByRole("textbox", { name: "Asset name" }).fill("Uni");
  await dialog.getByRole("textbox", { name: "Ticker" }).fill("UNI");
  const status = dialog.locator("[data-ticker-status]");
  await expect(status).toContainText("UNI encontrado (Uniswap)");
  const coin = dialog.getByRole("combobox", { name: "CoinGecko coin" });
  await expect(coin).toHaveValue("Uniswap");
  await coin.click();
  await page.getByRole("option", { name: /Unicorn Token/ }).click();
  await expect(status).toContainText("UNI encontrado (Unicorn Token)");
  expect(requests.at(-1)).toEqual(expect.objectContaining({ ticker: "UNI", coinId: "unicorn-token" }));
  await expect(coin).toHaveValue("Unicorn Token");
  await closeForm(dialog);
});
test("row editing opens the same populated position form", async ({ page }) => {
  await openPositions(page);
  const dialog = await openEditForm(page, "Bitcoin 01", "Ledger");


  await expect(dialog.getByRole("combobox", { name: "Asset type" })).toHaveValue("Crypto");
  await expect(dialog.getByRole("textbox", { name: "Asset name" })).toHaveValue("Bitcoin 01");
  await expect(dialog.getByRole("textbox", { name: "Quantity" })).toHaveCount(0);
  await expect(dialog.getByTestId("position-form-value-hint")).toContainText("use Movimentar");
  await expect(dialog.getByRole("combobox", { name: "Strategy" })).toHaveValue("Core-Satellite");
  await expect(dialog.getByText("The asset type and name apply to every month.")).toBeVisible();

  await formTab(dialog, "Asset").click();
  await expect(dialog.getByRole("textbox", { name: "Ticker" })).toHaveCount(0);
  await expect(dialog.getByText("BTC", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Maturity", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Liquidity" })).toBeVisible();

  await formTab(dialog, "Allocation").click();
  await expect(dialog.getByRole("combobox", { name: "Class of allocation 1", exact: true })).toHaveValue("Crypto");
  await expect(dialog.getByRole("combobox", { name: "Subclass of allocation 1", exact: true })).toHaveValue("BTC");
  await expect(issueCount(dialog)).toHaveAttribute("data-issue-count", "0");


  await dialog.getByRole("textbox", { name: "Weight of allocation 1" }).fill("90");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByTestId("position-form-issue")).toContainText("Allocation: Allocation totals 90%");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("removing a position requires confirmation", async ({ page }) => {
  await openPositions(page);

  await expect(positionRow(page, "Porquinho").getByRole("button", { name: /^(Movimentar|Liquidar|Editar|Remover) / })).toHaveCount(0);
  await openPositionPage(page, "Porquinho");
  await page.getByRole("button", { name: "Remove", exact: true }).click();

  const confirm = page.getByRole("dialog", { name: "Remover Porquinho?" });
  await expect(confirm).toContainText("Apaga o registro");
  await expect(confirm.getByRole("button", { name: "Liquidate" })).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
});

test("position detail uses the same edit form", async ({ page }) => {
  await openPositions(page);
  await waitForCompetenceHydration(page);
  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();


  await expect(page.getByRole("button", { name: "Renomear ativo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /liquidez$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit position" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar Porquinho" });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("textbox", { name: "Balance (BRL)" })).toHaveCount(0);
  await expect(dialog.getByText("Balance (BRL)")).toBeVisible();
  await formTab(dialog, "Asset").click();
  await expect(dialog.getByRole("textbox", { name: "Maturity", exact: true })).toBeVisible();

  await expect(dialog.getByRole("checkbox", { name: /Conta corrente/ })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("closed-month position detail does not allow editing", async ({ page }) => {
  await page.goto("/posicoes?mes=2026-08");
  await waitForCompetenceHydration(page);
  await positionRow(page, "Porquinho").getByRole("link", { name: "Porquinho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Porquinho" })).toBeVisible();
  const edit = page.getByRole("button", { name: "Edit position" });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute("title", /Aug\/26 is closed/);
});
