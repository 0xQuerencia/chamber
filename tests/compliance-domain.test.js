import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_SERVICES,dueShift,normalizeWorkdays,planningRule} from "../src/compliance-domain.js";
test("starter pack contains all blueprint compliance categories",()=>{
 const codes=STARTER_SERVICES.map(s=>s.code);
 assert.equal(new Set(codes).size,codes.length);
 assert.ok(codes.includes("gstr1_monthly"));
 assert.ok(codes.includes("gstr3b_monthly"));
 assert.ok(codes.includes("tds_quarterly"));
 assert.ok(codes.includes("advance_tax"));
 assert.ok(codes.includes("itr"));
 assert.ok(codes.includes("tax_audit"));
 assert.ok(codes.includes("pf_esi"));
 assert.ok(codes.includes("roc_filings"));
});
test("firm Saturdays/Sundays and holidays adjust deterministically",()=>{
 assert.equal(dueShift("2026-11-22","none",[1,2,3,4,5]),"2026-11-22");
 assert.equal(dueShift("2026-11-22","previous_workday",[1,2,3,4,5]),"2026-11-20");
 assert.equal(dueShift("2026-11-22","next_workday",[1,2,3,4,5]),"2026-11-23");
 assert.equal(dueShift("2026-11-22","next_workday",[1,2,3,4,5],["2026-11-23"]),"2026-11-24");
 assert.equal(planningRule("2026-11-22",{due_shift:"next_workday"},[1,2,3,4,5],["2026-11-23"]),"2026-11-24");
});
test("invalid working days and dates are rejected",()=>{
 assert.deepEqual(normalizeWorkdays([6,1,5]),[1,5,6]);
 assert.throws(()=>normalizeWorkdays([7]));
 assert.throws(()=>normalizeWorkdays([1,1]));
 assert.throws(()=>dueShift("2026-02-30","previous_workday"));
});
