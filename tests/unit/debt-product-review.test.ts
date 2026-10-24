import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { applyAssetAttributes, restoreAssetState } from "@/modules/portfolio/application/asset-attributes";
import { reviewedDebtProduct } from "@/modules/portfolio/presentation/asset-classification";

test("confirming a legacy product changes metadata only and Undo restores a missing contract", async () => {
  const asset = { id: "legacy", name: "Deposit", normalizedKey: "private:fixed-income:deposit", liquidity: null, maturityDate: null, quoteSymbol: null, cashAccount: false, autoIncome: false, assetType: "fixed-income", baseCurrency: "BRL", fixedIncomeContract: null as unknown };
  let written: Record<string, unknown> = {};
  const transaction = { asset: {
    findUnique: async () => ({ ...asset }),
    findFirst: async () => null,
    update: async ({ data }: { data: Record<string, unknown> }) => { written = data; Object.assign(asset, data); },
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { written = data; },
  } } as unknown as Prisma.TransactionClient;
  const state = await applyAssetAttributes(transaction, asset.id, { name: "Deposit", liquidity: null, maturityDate: null, displayProduct: "LCI" });
  assert.ok(state);
  assert.equal(reviewedDebtProduct(written.fixedIncomeContract), "LCI");
  assert.equal("cdiPercent" in written, false);
  assert.equal("quantity" in written, false);
  assert.equal("totalBrl" in written, false);
  const backupRoundTrip = JSON.parse(JSON.stringify(asset.fixedIncomeContract));
  assert.equal(reviewedDebtProduct(backupRoundTrip), "LCI");
  await restoreAssetState(transaction, state);
  assert.equal(written.fixedIncomeContract, Prisma.DbNull);
});

test("a recorded contract cannot be relabeled as another debt product", async () => {
  const transaction = { asset: { findUnique: async () => ({ id: "contract", name: "Deposit", normalizedKey: "private:fixed-income:deposit", liquidity: null, maturityDate: null, quoteSymbol: null, cashAccount: false, autoIncome: false, assetType: "fixed-income", baseCurrency: "BRL", fixedIncomeContract: { product: "CDB", rate: "100", indexer: "CDI" } }) } } as unknown as Prisma.TransactionClient;
  await assert.rejects(applyAssetAttributes(transaction, "contract", { name: "Deposit", liquidity: null, maturityDate: null, displayProduct: "LCA" }), /contract determines/);
});
