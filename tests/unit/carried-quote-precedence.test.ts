import test from "node:test";
import assert from "node:assert/strict";
import {Prisma} from "../../src/generated/prisma/client";
import {readMonthQuoteValues,readQuoteSeries} from "../../src/modules/quotes/application/month-quote-values";
const referenceDate=new Date("2026-11-01T00:00:00Z");
function reader(instrumentType:string,carriedFrom:Date|null=null){
 const common={symbol:"TD:TEST:2084-12-15",baseCurrency:"BRL",referenceDate};
 return {marketQuote:{findMany:async()=>[{...common,instrumentType:"TESOURO",valueBrl:new Prisma.Decimal("165.19"),quoteDate:new Date("2026-11-04"),carriedFrom}]},manualQuote:{findMany:async()=>[{...common,instrumentType,valueBrl:new Prisma.Decimal("153.32")}]}} as unknown as Parameters<typeof readMonthQuoteValues>[0];
}
test("official market quotes supersede provisional carried values without deleting either",async()=>{
 const db=reader("CARRIED");
 assert.equal((await readMonthQuoteValues(db,referenceDate)).values().next().value?.valueBrl.toFixed(),"165.19");
 assert.equal((await readQuoteSeries(db,["TD:TEST:2084-12-15"]))[0].valueBrl.toFixed(),"165.19");
});
test("explicit manual quotes and provisional values without official closes retain precedence",async()=>{
 assert.equal((await readMonthQuoteValues(reader("TESOURO"),referenceDate)).values().next().value?.valueBrl.toFixed(),"153.32");
 assert.equal((await readQuoteSeries(reader("CARRIED",new Date("2026-10-01")),["TD:TEST:2084-12-15"]))[0].valueBrl.toFixed(),"153.32");
});

test("provisional monthly prices remain marked as carried so daily history can replace them",async()=>{
 const db={marketQuote:{findMany:async()=>[]},manualQuote:reader("CARRIED").manualQuote} as unknown as Parameters<typeof readMonthQuoteValues>[0];
 const series=await readQuoteSeries(db,["TD:TEST:2084-12-15"]);
 assert.equal(series[0].carriedFrom?.toISOString(),referenceDate.toISOString());
 assert.equal((await readMonthQuoteValues(db,referenceDate)).values().next().value?.carriedFrom?.toISOString(),referenceDate.toISOString());
});
