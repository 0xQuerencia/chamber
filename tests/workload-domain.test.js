import test from "node:test";
import assert from "node:assert/strict";
import {workloadWindow,capacityPercent} from "../src/workload-domain.js";

test("workload covers fourteen Indian calendar dates, including today",()=>{
 assert.deepEqual(workloadWindow(new Date("2026-11-30T19:00:00Z")),{start:"2026-12-01",end:"2026-12-14"});
});
test("capacity matches the two-week horizon and can exceed 100 percent",()=>{
 assert.equal(capacityPercent(2400,40),50);
 assert.equal(capacityPercent(4800,40),100);
 assert.equal(capacityPercent(6000,40),125);
 assert.throws(()=>capacityPercent(60,0));
});
