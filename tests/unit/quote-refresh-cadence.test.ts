import test from "node:test";
import assert from "node:assert/strict";
import { isQuoteDue, backoffUntil } from "../../src/modules/quotes/domain/quote-sync";

const lastSuccessAt = new Date("2026-11-01T12:00:00Z");
const at = (minutes:number) => new Date(lastSuccessAt.getTime()+minutes*60_000);
test("market prices become due at five minutes while reference FX retains its cadence", () => {
  for (const instrumentType of ["CRIPTO","EU_ETF","ETF","ACAO","TESOURO"]) {
    const state = {instrumentType,lastSuccessAt,nextAttemptAt:null};
    assert.equal(isQuoteDue(state,at(4.99)),false);
    assert.equal(isQuoteDue(state,at(5)),true);
  }
  const fiat = {instrumentType:"FIAT",lastSuccessAt,nextAttemptAt:null};
  assert.equal(isQuoteDue(fiat,at(5)),false);
  assert.equal(isQuoteDue(fiat,at(50)),true);
});
test("faster polling preserves provider failure backoff and immediate initial fetch", () => {
  assert.equal(isQuoteDue({lastSuccessAt:null,nextAttemptAt:null},at(0)),true);
  const nextAttemptAt=backoffUntil(lastSuccessAt,1);
  assert.equal(isQuoteDue({lastSuccessAt,nextAttemptAt},at(5)),false);
  assert.equal(isQuoteDue({lastSuccessAt,nextAttemptAt},nextAttemptAt),true);
});
