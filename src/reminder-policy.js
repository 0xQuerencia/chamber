// Reminder stages are firm planning rules, never legal compliance deadlines.
export function validDay(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function dayGap(today,due){
 if(!validDay(today)||!validDay(due))throw Error("A valid calendar date is required");
 return Math.round((Date.parse(due+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
}
export function normalizeReminderRule(input={}){
 const defaults={ask_days:10,remind_days:6,escalate_days:3,max_reminders:4};
 const rule={};
 for(const [key,defaultValue] of Object.entries(defaults)){
  const value=input[key]===undefined?defaultValue:Number(input[key]);
  if(!Number.isInteger(value)||value<0||value>60)throw Error("Invalid reminder setting: "+key);
  rule[key]=value;
 }
 if(!(rule.ask_days>=rule.remind_days&&rule.remind_days>=rule.escalate_days))throw Error("Reminder days must run from ask to reminder to escalation");
 if(rule.max_reminders<1||rule.max_reminders>10)throw Error("Maximum reminders must be between 1 and 10");
 return rule;
}
export function reminderStage(daysLeft,rule){
 if(!Number.isInteger(daysLeft)||daysLeft<0)return null;
 const r=normalizeReminderRule(rule);
 if(daysLeft<=r.escalate_days)return "escalate";
 if(daysLeft<=r.remind_days)return "remind";
 if(daysLeft<=r.ask_days)return "ask";
 return null;
}
export function validClock(s){return typeof s==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)}
export function quietHoursActive(localClock,start="21:00",end="08:00"){
 if(!validClock(localClock)||!validClock(start)||!validClock(end))throw Error("Invalid quiet hours");
 if(start===end)return true;
 return start<end?localClock>=start&&localClock<end:localClock>=start||localClock<end;
}
