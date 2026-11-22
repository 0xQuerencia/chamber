import test from "node:test";
import assert from "node:assert/strict";
import {validPan,validGstin,gstinCheckCharacter,validClientPhone} from "../src/client-validation.js";
test("PAN format",()=>{
 assert.equal(validPan("ABCDE1234F"),true);
 assert.equal(validPan("abcde1234f"),true);
 assert.equal(validPan("ABCDE12345"),false);
});
test("GSTIN format and mod-36 checksum",()=>{
 const payload="24ABCDE1234F1Z";
 const gstin=payload+gstinCheckCharacter(payload);
 assert.equal(gstin.length,15);
 assert.equal(validGstin(gstin),true);
 const last=gstin.at(-1)==="0"?"1":"0";
 assert.equal(validGstin(payload+last),false);
 assert.equal(validGstin("99ABCDE1234F1Z0"),false);
});
test("contact phone",()=>{
 assert.equal(validClientPhone("+91 98765 43210"),true);
 assert.equal(validClientPhone("abcd"),false);
});
