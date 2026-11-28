import test from "node:test";
import assert from "node:assert/strict";
import {normalizeProcedureBody} from "../src/procedures.js";
test("procedure body preserves multiline steps and rejects invalid input",()=>{
 assert.equal(normalizeProcedureBody("  Step 1\r\nStep 2  "),"Step 1\nStep 2");
 for(const input of [""," ",{}, "x".repeat(10001),"bad\u0000data"])assert.equal(normalizeProcedureBody(input),null);
});
