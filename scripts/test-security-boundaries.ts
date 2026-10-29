/** Security integration writes only to a fresh disposable schema. No user portfolio is accessed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrismaClient, databaseSchema } from "@/lib/prisma";
import { runAsUser, getUserDb } from "@/lib/user-db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { exportBackup, restoreBackup } from "@/modules/backup/application/backup";
async function main(){
 assert.match(databaseSchema(process.env.DATABASE_URL??"")??"",/^english099_[a-f0-9]+$/);
 const db=getPrismaClient()!;const owners=[randomUUID(),randomUUID()];
 try{
  const fixtures:{account:{id:string};asset:{id:string};month:{id:string};position:{id:string}}[]=[];
  for(const id of owners){
   await db.user.create({data:{id,name:"Isolated security test",email:`${id}@portfolio.invalid`}});
   const institution=await db.institution.create({data:{userId:id,name:"Private",normalizedName:"private"}});
   const account=await db.account.create({data:{userId:id,institutionId:institution.id,name:"Private"}});
   const asset=await db.asset.create({data:{userId:id,name:"Private",normalizedKey:"private",assetType:"us-etf",quoteSymbol:"TEST",baseCurrency:"USD"}});
   const month=await db.portfolioMonth.create({data:{userId:id,referenceDate:new Date("2026-10-01"),status:"REVIEWED"}});
   const position=await db.position.create({data:{userId:id,accountId:account.id,assetId:asset.id,portfolioMonthId:month.id,quantity:1,openingQuantity:0,totalBrl:500,unitPriceBrl:500}});
   fixtures.push({account,asset,month,position});
  }
  await runAsUser(owners[0],async()=>{
   const scoped=(await getUserDb())!;
   assert.equal(await scoped.position.findUnique({where:{id:fixtures[1].position.id}}),null);
   await assert.rejects(()=>scoped.position.update({where:{id:fixtures[1].position.id},data:{totalBrl:1}}));
   await assert.rejects(()=>scoped.position.create({data:{userId:owners[0],accountId:fixtures[1].account.id,assetId:fixtures[0].asset.id,portfolioMonthId:fixtures[0].month.id,quantity:1,openingQuantity:0,totalBrl:1}}));
   await assert.rejects(()=>scoped.asset.update({where:{id:fixtures[0].asset.id},data:{userId:owners[1]}}),/ownership cannot be changed/);
   const backup=await exportBackup();assert.ok(backup);assert.equal(backup.tables.positions.length,1);
   assert.ok(!JSON.stringify(backup).includes(owners[1]));
   const forged=structuredClone(backup);
   forged.tables.marketQuotes.push({id:randomUUID(),referenceDate:"2099-01-01T00:00:00.000Z",symbol:"MALICIOUS",instrumentType:"ETF",baseCurrency:"USD",valueBrl:"999999",quoteDate:"2099-01-02T00:00:00.000Z",carriedFrom:null,createdAt:new Date().toISOString()});
   await assert.rejects(()=>restoreBackup(forged),/market history not available/);
   assert.equal(await db.marketQuote.count({where:{symbol:"MALICIOUS"}}),0);
   assert.equal((await db.position.findUniqueOrThrow({where:{id:fixtures[0].position.id}})).totalBrl.toString(),"500");
   assert.equal((await db.position.findUniqueOrThrow({where:{id:fixtures[1].position.id}})).totalBrl.toString(),"500");
   await restoreBackup(backup);
   assert.equal(await scoped.position.count(),1);assert.equal(await db.position.count({where:{userId:owners[1]}}),1);
  });
  const key=randomUUID();const responses=await Promise.all(Array.from({length:12},()=>consumeRateLimit(owners[0],key,5,60)));
  assert.equal(responses.filter(r=>r.allowed).length,5);
  assert.equal((await consumeRateLimit(owners[1],key,5,60)).allowed,true);
  console.log("Isolated security tests passed: cross-user reads/writes/relations rejected, forged global quote import rolled back, backup round-trip preserved ownership, concurrent limits atomic and per-user.");
 }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Security integration failed");process.exitCode=1;});
