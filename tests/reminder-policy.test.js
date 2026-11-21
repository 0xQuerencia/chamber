import test from "node:test";
import assert from "node:assert/strict";
import {dayGap,reminderStage,normalizeReminderRule,quietHoursActive,validDay} from "../src/reminder-policy.js";
test("reminder stages correspond to default 10/6/3 cadence",()=>{
 const r=normalizeReminderRule();
 assert.equal(reminderStage(11,r),null);
 assert.equal(reminderStage(10,r),"ask");
 assert.equal(reminderStage(7,r),"ask");
 assert.equal(reminderStage(6,r),"remind");
 assert.equal(reminderStage(4,r),"remind");
 assert.equal(reminderStage(3,r),"escalate");
 assert.equal(reminderStage(0,r),"escalate");
 assert.equal(reminderStage(-1,r),null);
});
test("calendar math is leap-safe and never locale-dependent",()=>{
 assert.equal(dayGap("2028-02-28","2028-03-01"),2);
 assert.equal(validDay("2027-02-29"),false);
});
test("overnight quiet hours respect boundaries",()=>{
 assert.equal(quietHoursActive("21:00"),true);
 assert.equal(quietHoursActive("07:59"),true);
 assert.equal(quietHoursActive("08:00"),false);
 assert.equal(quietHoursActive("20:59"),false);
});
test("misordered cadence rejected",()=>{
 assert.throws(()=>normalizeReminderRule({ask_days:3,remind_days:6}));
 assert.throws(()=>normalizeReminderRule({max_reminders:0}));
});
