import test from "node:test";
import assert from "node:assert/strict";
import { clean, validEmail, safeStatus, statusForRole, csvCell } from "../src/validation.js";
test("clean strips control characters and enforces length",()=>{
  assert.equal(clean("  hello\nworld  ",30),"hello world");
  assert.equal(clean("abcdef",3),"abc");
  assert.equal(clean({foo:"bar"}),"");
});
test("email validation",()=>{
  assert.equal(validEmail("ca@example.in"),true);
  assert.equal(validEmail("invalid"),false);
  assert.equal(validEmail("a@b"),false);
});
test("task status enforcement",()=>{
  assert.equal(safeStatus("review"),"review");
  assert.equal(safeStatus("approved"),null);
  assert.equal(statusForRole("staff","done"),false);
  assert.equal(statusForRole("manager","done"),true);
  assert.equal(statusForRole("staff","review"),true);
});
test("CSV neutralizes spreadsheet formulas and escapes quotes",()=>{
  assert.equal(csvCell("=1+1"),"\"'=1+1\"");
  assert.equal(csvCell("hello \"world\""),"\"hello \"\"world\"\"\"");
});
