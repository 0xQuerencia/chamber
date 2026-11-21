import type {View} from "./types";

export interface ShortcutDef {
 key:string;
 label:string;
 description:string;
 group:"Global"|"Go to"|"Registers"|"Forms";
}
export const goShortcuts:Readonly<Record<string,View>>={
 d:"desk",t:"tracker",w:"board",r:"requests",c:"clients",l:"activity"
};
export const shortcuts:ShortcutDef[]=[
 {key:"Ctrl+K",label:"Go to / search",description:"Find any screen, client, assignment, or requirement",group:"Global"},
 {key:"Alt+G",label:"Go To",description:"Open the Tally-style screen and record selector",group:"Global"},
 {key:"F1 / F11",label:"Help",description:"Open keyboard help and available features",group:"Global"},
 {key:"F2",label:"Date",description:"Change the displayed working date",group:"Global"},
 {key:"F3",label:"Firm",description:"View the active firm",group:"Global"},
 {key:"F4–F9",label:"Function keys",description:"Open Clients, Work, Documents, Request, Receive or Tasks",group:"Global"},
 {key:"F10",label:"Gateway",description:"Return to Gateway of Chamber",group:"Global"},
 {key:"?",label:"Keyboard help",description:"Show or hide this shortcut guide",group:"Global"},
 {key:"/",label:"Focus filter",description:"Focus the current list filter or open Go to",group:"Global"},
 {key:"Esc",label:"Back / close",description:"Close panels and dialogs; return to the desk",group:"Global"},
 {key:"G then D",label:"Gateway",description:"Open the CA firm desk",group:"Go to"},
 {key:"G then T",label:"Data tracker",description:"Open client × month information",group:"Go to"},
 {key:"G then W",label:"Work board",description:"Open assignment lanes",group:"Go to"},
 {key:"G then R",label:"Requests",description:"Open bulk requests",group:"Go to"},
 {key:"G then C",label:"Client Master",description:"Search and manage client records",group:"Go to"},
 {key:"G then L",label:"Activity",description:"Open the activity and sync log",group:"Go to"},
 {key:"Arrow keys",label:"Move selection",description:"Navigate rows and monthly tracker cells",group:"Registers"},
 {key:"Enter",label:"Open record",description:"Open the focused row or cell",group:"Registers"},
 {key:"Space",label:"Select work",description:"Toggle a focused card in Work Board",group:"Registers"},
 {key:"A",label:"Assign",description:"Open assignment controls on a Work Board card",group:"Registers"},
 {key:"R",label:"Request",description:"Open a data request from a tracker cell",group:"Registers"},
 {key:"M",label:"Mark received",description:"Open inward entry from a tracker cell",group:"Registers"},
 {key:"Ctrl+A",label:"Continue voucher",description:"Open the verified request or receipt workflow; no direct sending",group:"Forms"},
 {key:"Ctrl+Enter",label:"Submit form",description:"Save the active record form",group:"Forms"},
 {key:"Alt+S",label:"Save form",description:"Save the active record form",group:"Forms"},
 {key:"Tab / Shift+Tab",label:"Move between fields",description:"Navigate a form in field order",group:"Forms"}
];
export function isTextInteraction(target:EventTarget|null):boolean {
 if(!(target instanceof HTMLElement))return false;
 return Boolean(target.closest("input,textarea,select,[contenteditable='true'],[role='textbox']"));
}
