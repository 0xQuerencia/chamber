// Calendar-only functions: no browser locale or implicit tax rules.
export function validCalendarDate(value) {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00.000Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function shiftCalendarDays(value,delta) {
 if(!validCalendarDate(value)||!Number.isInteger(delta))throw Error("Invalid date or offset");
 const d=new Date(value+"T00:00:00.000Z");d.setUTCDate(d.getUTCDate()+delta);
 return d.toISOString().slice(0,10);
}
export function validMonth(value) {
 return typeof value==="string"&&/^(20[2-9]\d|2100)-(0[1-9]|1[0-2])$/.test(value);
}
export function sequenceMonths(from,count=12) {
 if(!validMonth(from)||!Number.isInteger(count)||count<1||count>12)throw Error("Invalid financial-year range");
 const [y,m]=from.split("-").map(Number);
 return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-1+i,1));return d.toISOString().slice(0,7)});
}
export function trackerCellState(tasks,total,received,waived) {
 if(!tasks)return "not_due";
 if(!total)return "unconfigured";
 const required=Math.max(0,total-waived);
 if(received>=required)return "complete";
 return received>0?"partial":"missing";
}
