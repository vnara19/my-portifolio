import assert from "node:assert/strict";
import test from "node:test";
import { limitedBytes, limitedJson, BodyLimitError, assertJsonBudget } from "../../src/lib/request-body";
import { contentSecurityPolicy } from "../../src/lib/security-policy";

test("body limits cannot be bypassed using missing or false content length",async()=>{
 const stream=()=>new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(6));c.enqueue(new Uint8Array(6));c.close();}});
 await assert.rejects(()=>limitedBytes(stream(),10),BodyLimitError);
 await assert.rejects(()=>limitedBytes(stream(),10,"1"),BodyLimitError);
 await assert.rejects(()=>limitedBytes(null,10,"999999"),BodyLimitError);
 const request=new Request("https://portfolio.invalid",{method:"POST",body:JSON.stringify({note:"<script>alert(1)</script>"})});
 assert.deepEqual(await limitedJson(request),{note:"<script>alert(1)</script>"});
 await assert.rejects(()=>limitedJson(new Request("https://portfolio.invalid",{method:"POST",body:"not json"})),SyntaxError);
});
test("production script policy requires a valid unique nonce and blocks common injection vectors",()=>{
 const policy=contentSecurityPolicy("YWJjMTIz");
 assert.match(policy,/script-src 'self' 'nonce-YWJjMTIz' 'strict-dynamic'/);
 assert.ok(!policy.split(';').find(v=>v.trim().startsWith('script-src'))?.includes('unsafe-inline'));
 assert.ok(!policy.includes('unsafe-eval'));
 assert.match(policy,/frame-ancestors 'none'/);assert.match(policy,/object-src 'none'/);assert.match(policy,/form-action 'self'/);
 assert.notEqual(policy,contentSecurityPolicy("ZGVmNDU2"));
 assert.throws(()=>contentSecurityPolicy("bad'; script-src *"));
});

import { safeSignInTarget } from "../../src/modules/auth/safe-redirect";
test("post-login redirects reject external URLs, controls and normalized backslashes",()=>{
 for(const target of ["//evil.invalid","/\\evil.invalid","https://evil.invalid","javascript:alert(1)","/\tevil.invalid","/entrar?para=/"]){assert.equal(safeSignInTarget(target),"/");}
 assert.equal(safeSignInTarget("/posicoes?mes=2026-10#account"),"/posicoes?mes=2026-10#account");
});

import { fetchProvider } from "../../src/modules/quotes/infrastructure/http";
test("provider redirects cannot forward secrets to another origin or downgrade HTTPS",async()=>{
 const previous=globalThis.fetch;const seen:string[]=[];
 try{
 globalThis.fetch=async input=>{seen.push(String(input));return new Response(null,{status:302,headers:{location:"https://attacker.invalid/steal"}});};
 await assert.rejects(()=>fetchProvider("https://provider.invalid/api",{headers:{authorization:"synthetic-test-token"}}),/Cross-origin/);assert.equal(seen.length,1);
 await assert.rejects(()=>fetchProvider("http://provider.invalid/api"),/Untrusted/);
 globalThis.fetch=async input=>String(input).endsWith('/api')?new Response(null,{status:302,headers:{location:'/latest'}}):new Response('{}');
 assert.equal((await fetchProvider("https://provider.invalid/api")).status,200);
 }finally{globalThis.fetch=previous;}
});

test("JSON depth and prototype keys are rejected before backup processing",()=>{
 let value:unknown="leaf";for(let i=0;i<45;i++)value={nested:value};assert.throws(()=>assertJsonBudget(value),BodyLimitError);
 assert.throws(()=>assertJsonBudget(JSON.parse('{"__proto__":{"polluted":true}}')),BodyLimitError);
 assert.equal(({} as {polluted?:boolean}).polluted,undefined);
});
