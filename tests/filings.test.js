import test from "node:test";
import assert from "node:assert/strict";
import {validateFiling} from "../src/filings.js";
import {clean} from "../src/validation.js";
const now=new Date("2026-11-28T01:00:00Z"),sample={kind:"return",reference:"TEST-001",filed_on:"2026-11-28",evidence_location:"Fictional test archive"};
test("requires manual reference, evidence location, and a valid non-future Indian filing date",()=>{
 assert.ok(validateFiling(sample,clean,now));
 for(const patch of [{reference:""},{evidence_location:""},{kind:"unknown"},{filed_on:"2026-11-29"},{filed_on:"2026-02-30"}])assert.equal(validateFiling({...sample,...patch},clean,now),null);
});
