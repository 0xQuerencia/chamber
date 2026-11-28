import {shiftCalendarDays} from "./domain.js";

// Dates are Indian office calendar dates, not UTC date slices.
export function workloadWindow(now){
 const parts=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const part=type=>parts.find(p=>p.type===type).value;
 const start=part("year")+"-"+part("month")+"-"+part("day");
 return {start,end:shiftCalendarDays(start,13)};
}
export function capacityPercent(minutes,weeklyHours){
 if(!Number.isFinite(minutes)||minutes<0||!Number.isFinite(weeklyHours)||weeklyHours<=0)throw Error("Invalid capacity estimate");
 return Math.round(minutes/(weeklyHours*60*2)*100);
}
