import {validCalendarDate,shiftCalendarDays} from "./domain.js";

// Suggested workflow categories only. A firm must verify and maintain filing dates.
export const STARTER_SERVICES=[
 {code:"gstr1_monthly",name:"GSTR-1 monthly",service:"GST",frequency:"monthly",day:11,lead:10,
  requirements:["Sales register","Credit and debit notes","Invoice and GSTIN reconciliation"]},
 {code:"gstr3b_monthly",name:"GSTR-3B monthly",service:"GST",frequency:"monthly",day:20,lead:10,
  requirements:["Purchase register","ITC reconciliation","Output tax and payment details"]},
 {code:"tds_payment",name:"TDS payment monthly",service:"TDS",frequency:"monthly",day:7,lead:10,
  requirements:["TDS ledger","Deduction challans","PAN and section-wise deduction list"]},
 {code:"tds_quarterly",name:"Quarterly TDS return",service:"TDS",frequency:"quarterly",day:15,lead:15,
  requirements:["Challans and CIN","Deductee details and PAN","Quarterly reconciliation"]},
 {code:"advance_tax",name:"Advance tax planning",service:"Income Tax",frequency:"quarterly",day:15,lead:20,
  requirements:["Estimated income","Advance tax paid","Current-year tax working"]},
 {code:"itr",name:"Income tax return",service:"Income Tax",frequency:"annual",day:15,lead:25,
  requirements:["Income statement","Form 16 / 26AS / AIS","Tax computation"]},
 {code:"tax_audit",name:"Tax audit",service:"Audit",frequency:"annual",day:15,lead:30,
  requirements:["Books and trial balance","Bank statements","Supporting schedules"]},
 {code:"pf_esi",name:"PF / ESI planning",service:"Payroll Compliance",frequency:"monthly",day:15,lead:8,
  requirements:["Payroll registers","EPF / ESIC challans","Employee contribution details"]},
 {code:"roc_filings",name:"ROC annual filings",service:"ROC",frequency:"annual",day:15,lead:30,
  requirements:["Company financial statements","Board resolutions","Director and statutory disclosures"]}
];
export function dueShift(date,mode,workingDays=[1,2,3,4,5,6],holidays=[]){
 if(!validCalendarDate(date))throw Error("Invalid due date");
 if(!["none","previous_workday","next_workday"].includes(mode))throw Error("Invalid calendar rule");
 const days=new Set(workingDays),daysOff=new Set(holidays);
 if(mode==="none")return date;
 if(days.size===0||[...days].some(x=>!Number.isInteger(x)||x<0||x>6))throw Error("At least one valid working day is required");
 let current=date;
 for(let i=0;i<=90;i++){
  const day=new Date(current+"T00:00:00Z").getUTCDay();
  if(days.has(day)&&!daysOff.has(current))return current;
  current=shiftCalendarDays(current,mode==="previous_workday"?-1:1);
 }
 throw Error("Cannot determine a working day within ninety days");
}
export function normalizeWorkdays(value){
 if(!Array.isArray(value)||value.length===0||value.length>7||value.some(x=>!Number.isInteger(x)||x<0||x>6)||new Set(value).size!==value.length)
  throw Error("Use one to seven distinct weekdays (0 = Sunday)");
 return [...value].sort();
}
export function planningRule(date,template,workdays,holidays){
 return dueShift(date,template.due_shift||"none",workdays,holidays);
}
