import test from "node:test";
import assert from "node:assert/strict";
import {totpCode,verifyTotp} from "../src/mfa.js";
const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
test("RFC 6238 SHA-1 vector at T=59 seconds",async()=>{
 assert.equal(await totpCode(secret,1),"287082");
 assert.equal(await verifyTotp(secret,"287082",null,59000),1);
});
test("replayed or invalid codes cannot pass",async()=>{
 assert.equal(await verifyTotp(secret,"287082",1,59000),null);
 assert.equal(await verifyTotp(secret,"invalid",null,59000),null);
});
