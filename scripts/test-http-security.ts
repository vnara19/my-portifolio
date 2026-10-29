/** Exercise real built routes with synthetic credentials on an isolated local server. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { databaseSchema } from "@/lib/prisma";
async function main(){
 assert.match(databaseSchema(process.env.DATABASE_URL??"")??"",/^english099_[a-f0-9]+$/);
 const origin="http://localhost:3215";
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3215"],{env:{...process.env,BETTER_AUTH_URL:origin,AUTH_ALLOWED_HOSTS:"localhost:3215,127.0.0.1:3215"},stdio:["ignore","pipe","pipe"]});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Test server startup timed out")),30000);server.once("exit",()=>{clearTimeout(timer);reject(new Error("Test server exited"));});server.stdout.on("data",chunk=>{if(String(chunk).includes("Ready")){clearTimeout(timer);resolve();}});});
  const first=await fetch(`${origin}/entrar`,{headers:{"x-nonce":"attacker"}});assert.equal(first.status,200);
  const csp=first.headers.get("content-security-policy")!;assert.match(csp,/'strict-dynamic'/);assert.ok(!csp.includes('attacker'));assert.ok(!csp.includes('unsafe-eval'));assert.match(first.headers.get('cache-control')??'',/no-store/);
  const nonce=csp.match(/'nonce-([^']+)'/)![1];const html=await first.text();assert.ok(html.includes(`nonce="${nonce}"`));
  const second=await fetch(`${origin}/entrar`);assert.notEqual(second.headers.get('content-security-policy'),csp);
  const fake=await fetch(`${origin}/api/backup`,{headers:{cookie:"__Secure-better-auth.session_token=forged; better-auth.session_token=forged"}});assert.equal(fake.status,401);
  const oversize=await fetch(`${origin}/api/auth/sign-in/email`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:"test@portfolio.invalid",password:"x".repeat(20000)})});assert.equal(oversize.status,413);
  const foreign=await fetch(`${origin}/api/auth/sign-in/email`,{method:"POST",headers:{origin:"https://attacker.invalid","content-type":"application/json"},body:JSON.stringify({email:process.env.E2E_USER_EMAIL,password:process.env.E2E_USER_PASSWORD})});assert.equal(foreign.status,403);
  const login=await fetch(`${origin}/api/auth/sign-in/email`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:process.env.E2E_USER_EMAIL,password:process.env.E2E_USER_PASSWORD})});assert.equal(login.status,200);
  const cookies=login.headers.getSetCookie();assert.ok(cookies.some(c=>/HttpOnly/i.test(c)&&/Secure/i.test(c)&&/SameSite=Lax/i.test(c)));
  const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const privatePage=await fetch(`${origin}/configuracao`,{headers:{cookie}});assert.equal(privatePage.status,200);assert.match(await privatePage.text(),/Account Settings/);
  const tooLargeBackup=await fetch(`${origin}/api/backup/restore`,{method:"POST",headers:{origin,"content-type":"application/json",cookie},body:"x".repeat(10*1024*1024+1)});assert.equal(tooLargeBackup.status,413);
  console.log("HTTP security tests passed: unique nonces, injected nonce ignored, private caching, forged session rejected, login cookies protected, cross-origin login denied and streamed size limits enforced.");
 }finally{server.kill("SIGTERM");}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"HTTP security test failed");process.exitCode=1;});
