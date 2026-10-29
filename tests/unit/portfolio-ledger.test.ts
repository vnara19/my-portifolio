import assert from "node:assert/strict";
import test from "node:test";
import { portfolioLedgerRows } from "@/modules/portfolio/domain/portfolio-ledger";
test("portfolio contributions, partial withdrawals and maturity exits are not investment losses or gains",()=>{
 const rows=portfolioLedgerRows([
  {month:"2026-01",value:1000,flow:1000,opening:0,estimated:false},
  {month:"2026-02",value:1500,flow:500,opening:0,estimated:false},
  {month:"2026-03",value:1000,flow:-500,opening:0,estimated:false},
  {month:"2026-04",value:0,flow:-1000,opening:0,estimated:false},
 ]);
 assert.equal(rows[0].change,null);
 assert.deepEqual(rows.slice(1).map(r=>r.investmentChange),[0,0,0]);
 assert.equal(rows[1].change,500);assert.equal(rows[1].changePercent,50);
});
test("opening adjustments and currency movements retain their distinct portfolio meaning",()=>{
 const rows=portfolioLedgerRows([
  {month:"2026-01",value:1000,flow:0,opening:1000,estimated:false},
  {month:"2026-02",value:1550,flow:0,opening:500,estimated:false},
  {month:"2026-03",value:1300,flow:0,opening:0,estimated:false},
 ]);
 assert.equal(rows[1].investmentChange,50);assert.equal(rows[2].investmentChange,-250);
});
test("missing FX, incomplete flows and gaps never invent a portfolio investment result",()=>{
 const rows=portfolioLedgerRows([
  {month:"2026-01",value:1000,flow:0,opening:0,estimated:false},
  {month:"2026-03",value:1200,flow:0,opening:0,estimated:false},
  {month:"2026-04",value:1300,flow:null,opening:0,estimated:false},
  {month:"2026-05",value:null,flow:0,opening:0,estimated:false},
 ]);
 assert.equal(rows[1].change,null);assert.equal(rows[2].change,100);assert.equal(rows[2].investmentChange,null);assert.equal(rows[3].change,null);
});
