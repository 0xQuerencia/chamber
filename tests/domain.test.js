import test from "node:test";
import assert from "node:assert/strict";
import {validCalendarDate,shiftCalendarDays,validMonth,sequenceMonths,trackerCellState} from "../src/domain.js";
test("valid calendar date and leap year",()=>{
 assert.equal(validCalendarDate("2028-02-29"),true);
 assert.equal(validCalendarDate("2027-02-29"),false);
 assert.equal(validCalendarDate("2026-13-03"),false);
});
test("ask by dates across months",()=>{
 assert.equal(shiftCalendarDays("2027-01-05",-10),"2026-12-26");
 assert.equal(shiftCalendarDays("2028-03-01",-1),"2028-02-29");
});
test("financial year sequence",()=>{
 assert.equal(sequenceMonths("2026-04").at(-1),"2027-03");
 assert.equal(validMonth("2026-13"),false);
});
test("tracker count states",()=>{
 assert.equal(trackerCellState(0,0,0,0),"not_due");
 assert.equal(trackerCellState(1,0,0,0),"unconfigured");
 assert.equal(trackerCellState(1,4,0,0),"missing");
 assert.equal(trackerCellState(1,4,2,0),"partial");
 assert.equal(trackerCellState(1,4,3,1),"complete");
 assert.equal(trackerCellState(1,2,0,2),"complete");
});
