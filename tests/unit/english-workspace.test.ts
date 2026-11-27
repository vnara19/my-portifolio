import assert from "node:assert/strict";
import test from "node:test";

import { englishLabel } from "@/lib/english-labels";
import { englishTransactionNote, isAutomaticAccrualNote } from "@/lib/transaction-notes";
import { APP_AREAS } from "@/modules/access/domain/areas";
import { ASSET_CLASSES, subclassesOf } from "@/modules/portfolio/domain/classification";
import { formatMonth, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";

test("English display preserves legacy classification values and user names", () => {
  assert.ok(ASSET_CLASSES.includes("Renda Fixa"));
  assert.ok(subclassesOf("Renda Fixa").includes("Pós-fixado"));
  assert.equal(englishLabel("Renda Fixa"), "Fixed Income");
  assert.equal(englishLabel("Pós-fixado"), "Floating Rate");
  assert.equal(englishLabel("Renda Variável"), "Equities");
  assert.equal(englishLabel("Tesouro Direto"), "Tesouro Direto");
  assert.equal(englishLabel("My personal asset"), "My personal asset");
  assert.equal(englishLabel("Reserva Banco X"), "Reserva Banco X");
});

test("numeric input supports English grouping and legacy Brazilian decimals", () => {
  assert.equal(parseLocaleNumber("1,234.56"), 1234.56);
  assert.equal(parseLocaleNumber("1.234,56"), 1234.56);
  assert.equal(parseLocaleNumber("1,234"), 1234);
  assert.equal(parseLocaleNumber("12,5"), 12.5);
  assert.equal(parseLocaleNumber("12.5"), 12.5);
  assert.equal(parseLocaleNumber("invalid"), null);
  assert.match(formatMonth(new Date("2026-10-01T00:00:00Z")), /October/);
});

test("legacy generated notes remain recognizable and user notes are unchanged", () => {
  assert.equal(isAutomaticAccrualNote("Rendimento automático até 13/10/2026"), true);
  assert.equal(isAutomaticAccrualNote("Automatic accrual through 13/10/2026"), true);
  assert.equal(englishTransactionNote("Liquidação: recebido abaixo do saldo"), "Liquidation: received less than the balance");
  assert.equal(englishTransactionNote("Custom broker note"), "Custom broker note");
});

test("the application exposes only the investment workspace", () => {
  assert.deepEqual(APP_AREAS.map((area) => area.key), ["investments"]);
});
