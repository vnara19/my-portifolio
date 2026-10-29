/** Disposable-schema regression: historical corrections preserve later trades, fees and undo. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { updateTransaction } from "@/modules/portfolio/application/position-transactions";
import { undoChange } from "@/modules/portfolio/application/month-editing";
import { getPortfolioLedger } from "@/modules/portfolio/application/get-portfolio-ledger";
import { getPortfolioMonths } from "@/modules/portfolio/application/get-portfolio-months";
async function main(){
 assert.match(databaseSchema(process.env.DATABASE_URL??"")??"",/^english099_[a-f0-9]+$/);
 const db=getPrismaClient()!;
 const id=randomUUID();
 try {
 await db.user.create({data:{id,name:"Correction test",email:`${id}@portfolio.invalid`}});
 const i=await db.institution.create({data:{userId:id,name:"Portfolio",normalizedName:"portfolio"}});
 const a=await db.account.create({data:{userId:id,institutionId:i.id,name:"Main"}});
 const asset=await db.asset.create({data:{userId:id,name:"Test ETF",normalizedKey:"test-etf",assetType:"us-etf",ticker:"TEST",quoteSymbol:"TEST",baseCurrency:"USD"}});
 const dates=["2026-07-01","2026-08-01","2026-09-01"];
 const positions: {id:string;portfolioMonthId:string}[]=[];
 for(let n=0;n<3;n++){
  const m=await db.portfolioMonth.create({data:{userId:id,referenceDate:new Date(dates[n]),status:"REVIEWED"}});
  const p=await db.position.create({data:{userId:id,portfolioMonthId:m.id,accountId:a.id,assetId:asset.id,quantity:n===2?3:2,openingQuantity:n===0?0:2,unitPriceBrl:500,totalBrl:n===2?1500:1000}});
  await db.positionAllocation.create({data:{userId:id,positionId:p.id,assetClass:"Renda Variável",subclass:"Ações EUA",duration:"-",weight:1}});
  positions.push(p);
  await db.marketQuote.createMany({data:[{referenceDate:new Date(dates[n]),symbol:"USD",instrumentType:"FIAT",baseCurrency:"USD",valueBrl:5}],skipDuplicates:true});
 }
 await db.dailyQuote.createMany({data:["2026-07-15","2026-07-16","2026-09-15"].map(day=>({symbol:"USD",quoteDate:new Date(day),instrumentType:"FIAT",baseCurrency:"USD",valueBrl:5,provider:"test",fetchedAt:new Date()})),skipDuplicates:true});
 const old=await db.positionTransaction.create({data:{userId:id,positionId:positions[0].id,kind:"CONTRIBUTION",occurredOn:new Date("2026-07-15"),quantity:2,unitPriceBrl:500,amountBrl:1005,note:"Purchase: 2 × USD 100; commission USD 1; FX 5 BRL/USD."}});
 const later=await db.positionTransaction.create({data:{userId:id,positionId:positions[2].id,kind:"CONTRIBUTION",occurredOn:new Date("2026-09-15"),quantity:1,unitPriceBrl:500,amountBrl:500}});
 const outsider=randomUUID();
 await db.user.create({data:{id:outsider,name:"Other test owner",email:`${outsider}@portfolio.invalid`}});
 const outsideInstitution=await db.institution.create({data:{userId:outsider,name:"Other",normalizedName:"other"}});
 const outsideAccount=await db.account.create({data:{userId:outsider,institutionId:outsideInstitution.id,name:"Other"}});
 const outsideAsset=await db.asset.create({data:{userId:outsider,name:"Excluded",normalizedKey:"excluded",assetType:"us-etf",quoteSymbol:"EXCLUDED",baseCurrency:"USD"}});
 const outsideMonth=await db.portfolioMonth.create({data:{userId:outsider,referenceDate:new Date(dates[2]),status:"REVIEWED"}});
 const outsidePosition=await db.position.create({data:{userId:outsider,portfolioMonthId:outsideMonth.id,accountId:outsideAccount.id,assetId:outsideAsset.id,quantity:999999,openingQuantity:0,totalBrl:999999,unitPriceBrl:1}});
 await db.positionTransaction.create({data:{userId:outsider,positionId:outsidePosition.id,kind:"CONTRIBUTION",occurredOn:new Date("2026-09-15"),quantity:999999,amountBrl:999999}});
 await db.manualQuote.create({data:{userId:outsider,referenceDate:new Date(dates[2]),symbol:"USD",instrumentType:"FIAT",baseCurrency:"USD",valueBrl:9999}});
 await runAsUser(id,async()=>{
  const before=await getPortfolioLedger(await getPortfolioMonths());
  assert.ok(before);assert.equal(before.rows.at(-1)?.value,300);assert.equal(before.rows.at(-1)?.investmentChange,0);
  assert.equal(before.transactions.length,2);assert.ok(before.transactions.every(t=>t.assetId===asset.id));
  assert.equal(before.transactions.find(t=>t.id===old.id)?.amountBrl,201);
  assert.equal(before.targets[positions[0].id].positionId,positions[0].id);
  const input={monthId:positions[0].portfolioMonthId,transactionId:old.id,transaction:{positionId:positions[0].id,kind:"CONTRIBUTION" as const,occurredOn:"2026-07-16",quantity:"3",unitPriceBrl:null,amountBrl:"1005",note:old.note},nativeTrade:{currency:"USD" as const,price:"110",commission:"2",fxBrl:"5"}};
  const result=await updateTransaction(input);
  const corrected=await db.positionTransaction.findUniqueOrThrow({where:{id:old.id}});
  assert.equal(corrected.amountBrl.toString(),"1660");assert.equal(corrected.unitPriceBrl?.toString(),"550");assert.match(corrected.note??"",/commission USD 2; FX 5 BRL\/USD\./);
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[1].id}})).quantity.toString(),"3");
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[2].id}})).quantity.toString(),"4");
  assert.equal((await db.positionTransaction.findUniqueOrThrow({where:{id:later.id}})).quantity.toString(),"1");
  const after=await getPortfolioLedger(await getPortfolioMonths());
  assert.equal(after?.rows.at(-1)?.value,400);assert.equal(after?.rows.at(-1)?.investmentChange,0);
  assert.equal(after?.transactions.find(t=>t.id===old.id)?.amountBrl,332);
  await assert.rejects(updateTransaction({...input,monthId:positions[2].portfolioMonthId}),/does not belong|not found/i);
  await undoChange(result.undoToken);
  assert.equal((await db.positionTransaction.findUniqueOrThrow({where:{id:old.id}})).amountBrl.toString(),"1005");
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[2].id}})).quantity.toString(),"3");
  assert.equal((await getPortfolioLedger(await getPortfolioMonths()))?.rows.at(-1)?.value,300);
  await db.position.delete({where:{id:positions[2].id}});
  const missingExit=await getPortfolioLedger(await getPortfolioMonths());
  assert.equal(missingExit?.rows.at(-1)?.value,0);assert.equal(missingExit?.rows.at(-1)?.investmentChange,null);
 });
 console.log("Historical reviewed-month correction, native fees/FX, later holdings/trades, month ownership and multi-month Undo passed.");
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Correction integration failed");process.exitCode=1;});
