/** Disposable-schema regression: historical corrections preserve later trades, fees and undo. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databaseSchema, getPrismaClient } from "@/lib/prisma";
import { runAsUser } from "@/lib/user-db";
import { updateTransaction } from "@/modules/portfolio/application/position-transactions";
import { undoChange } from "@/modules/portfolio/application/month-editing";
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
 }
 const old=await db.positionTransaction.create({data:{userId:id,positionId:positions[0].id,kind:"CONTRIBUTION",occurredOn:new Date("2026-07-15"),quantity:2,unitPriceBrl:500,amountBrl:1005,note:"Purchase: 2 × USD 100; commission USD 1; FX 5 BRL/USD."}});
 const later=await db.positionTransaction.create({data:{userId:id,positionId:positions[2].id,kind:"CONTRIBUTION",occurredOn:new Date("2026-09-15"),quantity:1,unitPriceBrl:500,amountBrl:500}});
 await runAsUser(id,async()=>{
  const input={monthId:positions[0].portfolioMonthId,transactionId:old.id,transaction:{positionId:positions[0].id,kind:"CONTRIBUTION" as const,occurredOn:"2026-07-16",quantity:"3",unitPriceBrl:null,amountBrl:"1005",note:old.note},nativeTrade:{currency:"USD" as const,price:"110",commission:"2",fxBrl:"5"}};
  const result=await updateTransaction(input);
  const corrected=await db.positionTransaction.findUniqueOrThrow({where:{id:old.id}});
  assert.equal(corrected.amountBrl.toString(),"1660");assert.equal(corrected.unitPriceBrl?.toString(),"550");assert.match(corrected.note??"",/commission USD 2; FX 5 BRL\/USD\./);
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[1].id}})).quantity.toString(),"3");
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[2].id}})).quantity.toString(),"4");
  assert.equal((await db.positionTransaction.findUniqueOrThrow({where:{id:later.id}})).quantity.toString(),"1");
  await assert.rejects(updateTransaction({...input,monthId:positions[2].portfolioMonthId}),/does not belong|not found/i);
  await undoChange(result.undoToken);
  assert.equal((await db.positionTransaction.findUniqueOrThrow({where:{id:old.id}})).amountBrl.toString(),"1005");
  assert.equal((await db.position.findUniqueOrThrow({where:{id:positions[2].id}})).quantity.toString(),"3");
 });
 console.log("Historical reviewed-month correction, native fees/FX, later holdings/trades, month ownership and multi-month Undo passed.");
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Correction integration failed");process.exitCode=1;});
