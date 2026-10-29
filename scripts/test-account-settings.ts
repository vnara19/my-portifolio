/** Runs only in an isolated schema and never uses a real user's credentials. */
import assert from "node:assert/strict";
import { hashPassword } from "better-auth/crypto";
import { randomBytes } from "node:crypto";
import { getAuth, withSignUpOverride } from "../src/modules/auth/auth";
import { getPrismaClient } from "../src/lib/prisma";

async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 assert.match(url.searchParams.get("schema")??"",/^english099_[a-f0-9]+$/);
 const auth=getAuth();const db=getPrismaClient()!;
 const email=`account-${randomBytes(5).toString("hex")}@portfolio.invalid`;const password="Test!9"+randomBytes(24).toString("hex");
 await withSignUpOverride(()=>auth.api.signUpEmail({body:{email,password,name:"Isolated account settings"}}));
 const nextPassword="Next!9"+randomBytes(24).toString("hex");const nextEmail=`changed-${randomBytes(5).toString("hex")}@portfolio.invalid`;
 const legacyEmail=`legacy-${randomBytes(5).toString("hex")}@portfolio.invalid`;
 const legacy=await withSignUpOverride(()=>auth.api.signUpEmail({body:{email:legacyEmail,password,name:"Isolated legacy login"}}));
 await db.authAccount.updateMany({where:{userId:legacy.user.id,providerId:"credential"},data:{password:await hashPassword("Oldpass!91")}});
 const origin="http://localhost:3210";
 const request=async(path:string,body?:unknown,cookie?:string,originValue=origin)=>auth.handler(new Request(`${origin}/api/auth${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json",origin:originValue,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 const cookie=(response:Response)=>response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
 const login=async(address:string,pw:string)=>request("/sign-in/email",{email:address,password:pw});
 const legacyLogin=await login(legacyEmail,"Oldpass!91");assert.equal(legacyLogin.status,200);
 const publicSignup=await request("/sign-up/email",{email:process.env.E2E_USER_EMAIL,password,name:"Untrusted signup"});assert.equal(publicSignup.status,403);
 const first=await login(email,password);assert.equal(first.status,200);const originalCookie=cookie(first);
 const second=await login(email,password);assert.equal(second.status,200);const otherCookie=cookie(second);
 const before=await db.user.findUniqueOrThrow({where:{email}});
 const anonymous=await request("/account-email",{newEmail:nextEmail,currentPassword:password});assert.notEqual(anonymous.status,200);
 const forbidden=await request("/account-email",{newEmail:nextEmail,currentPassword:password},originalCookie,"https://untrusted.invalid");assert.notEqual(forbidden.status,200);
 const wrong=await request("/change-password",{currentPassword:"not-the-password",newPassword:nextPassword},originalCookie);assert.notEqual(wrong.status,200);
 const weak=await request("/change-password",{currentPassword:password,newPassword:"longbutonlylowercase"},originalCookie);assert.notEqual(weak.status,200);
 const changed=await request("/change-password",{currentPassword:password,newPassword:nextPassword,revokeOtherSessions:true},originalCookie);assert.equal(changed.status,200);
 const updatedCookie=cookie(changed);assert.ok(updatedCookie);
 const other=await request("/get-session",undefined,otherCookie);assert.equal(await other.json(),null);
 const invalidPassword=await request("/account-email",{newEmail:nextEmail,currentPassword:password},updatedCookie);assert.notEqual(invalidPassword.status,200);
 const duplicate=`duplicate-${randomBytes(5).toString("hex")}@portfolio.invalid`;
 await withSignUpOverride(()=>auth.api.signUpEmail({body:{email:duplicate,password:nextPassword,name:"Isolated second account"}}));
 const collision=await request("/account-email",{newEmail:duplicate,currentPassword:nextPassword},updatedCookie);assert.notEqual(collision.status,200);
 const updated=await request("/account-email",{newEmail:nextEmail,currentPassword:nextPassword},updatedCookie);assert.equal(updated.status,200);
 const after=await db.user.findUniqueOrThrow({where:{email:nextEmail}});assert.equal(after.id,before.id);assert.equal(after.emailVerified,false);
 assert.equal(await db.session.count({where:{userId:before.id}}),0);
 const oldLogin=await login(email,nextPassword);assert.notEqual(oldLogin.status,200);
 const newLogin=await login(nextEmail,nextPassword);assert.equal(newLogin.status,200);
 const loggedOut=await request("/sign-out",{},cookie(newLogin));assert.equal(loggedOut.status,200);
 assert.equal(await db.session.count({where:{userId:before.id}}),0);
 let limited=false;for(let i=0;i<6;i++){const response=await request("/account-email",{newEmail:nextEmail,currentPassword:nextPassword});limited ||= response.status===429;}assert.equal(limited,true);
 console.log("Isolated account tests passed: origin/session protection, password confirmation, session revocation, duplicate email rejection, preserved user ID, new login and logout.");
 await db.$disconnect();
}
main().catch((error)=>{console.error("Account security integration failed.", error instanceof Error ? error.stack?.split("\n").slice(0,5).join("\n") : "Unknown error");process.exitCode=1;}).finally(async()=>{await getPrismaClient()?.$disconnect();});
