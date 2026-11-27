import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { sameSavedClassifications } from "@/modules/portfolio/domain/saved-classification";

test("metadata edits preserve legacy weights and reject new manual splits", () => {
  const fixed = { assetClass: "Renda Fixa", subclass: "Pós-fixado", duration: "Longo", weight: new Prisma.Decimal("0.7"), ratePercent: new Prisma.Decimal("100") };
  const equity = { assetClass: "Renda Variável", subclass: "Ações BR", duration: "-", weight: new Prisma.Decimal("0.3"), ratePercent: null };
  assert.equal(sameSavedClassifications([fixed, equity], [equity, { ...fixed, weight: new Prisma.Decimal("0.70") }]), true);
  assert.equal(sameSavedClassifications([fixed, equity], [{ ...fixed, weight: new Prisma.Decimal("0.6") }, { ...equity, weight: new Prisma.Decimal("0.4") }]), false);
  assert.equal(sameSavedClassifications([fixed, equity], [{ ...fixed, weight: new Prisma.Decimal(1) }]), false);
  assert.equal(sameSavedClassifications([fixed], [{ ...fixed, ratePercent: new Prisma.Decimal("110") }]), false);
  assert.equal(sameSavedClassifications([fixed], [{ ...fixed, subclass: "IPCA" }]), false);
});
