import assert from "node:assert/strict";
import test from "node:test";
import { passwordPolicyError } from "../../src/modules/auth/password-policy";
test("new passwords require length and every requested character class",()=>{
 for(const password of ["Short!9a","onlylowercasepassword9!","ONLYUPPERCASEPASSWORD9!","NoNumbersInThisPassword!","NoSymbolsInThisPassword9","Has space but no symbol9","Aa9!"+"x".repeat(125)]) assert.ok(passwordPolicyError(password));
 assert.equal(passwordPolicyError("Long-Unique!Password9"),null);
 assert.equal(passwordPolicyError("Árvore-Grande!Segura9"),null);
});
