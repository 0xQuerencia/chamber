import {useEffect,useMemo,useState} from "react";
import type {Workspace,View,Task,Requirement} from "./types";

type Props={workspace:Workspace;onNavigate:(view:View)=>void;preview:boolean};
type Entry={label:string;view:View};
const sections:{label:string;items:Entry[]}[]=[
 {label:"MASTERS",items:[{label:"Clients",view:"clients"},{label:"Staff",view:"team"},{label:"Compliance Types",view:"compliance"}]},
 {label:"TRANSACTIONS",items:[{label:"Data Request",view:"requests"},{label:"Data Received",view:"tracker"},{label:"Task Allocation",view:"board"}]},
 {label:"REPORTS",items:[{label:"Pending Data Tracker",view:"tracker"},{label:"Staff Work Register",view:"work"},{label:"Compliance Summary",view:"compliance"}]},
 {label:"UTILITIES",items:[{label:"WhatsApp Communication",view:"requests"},{label:"Firm Settings",view:"settings"}]}
];
const ordered=sections.flatMap(s=>s.items);
const statusName:Record<string,string>={missing:"Not received",requested:"Requested",received:"Received",verified:"Verified",rejected:"Rejected",not_applicable:"Not applicable"};
function getFY(today:Date){const yr=today.getFullYear()-(today.getMonth()<3?1:0);return yr+"-"+String(yr+1).slice(-2);}
function clientName(workspace:Workspace,id:string){return workspace.clients.find(c=>c.id===id)?.name??"—";}
function pending(doc:Requirement){return !["received","verified","not_applicable"].includes(doc.status);}
function monthLabel(d:Date){return d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"}).replace(" ","-");}
function monthKey(d:Date){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function allPeriods(){const now=new Date();return Array.from({length:5},(_,i)=>new Date(now.getFullYear(),now.getMonth()-4+i,1));}

export function TallyGateway({workspace,onNavigate,preview}:Props){
 const [cursor,setCursor]=useState(3);
 const pendingCount=workspace.documents.filter(pending).length;
 const unassigned=workspace.tasks.filter(t=>!t.assignee_id&&t.status!=="done").length;
 useEffect(()=>{
  function key(event:KeyboardEvent){
   if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
   if(event.key==="ArrowDown"){event.preventDefault();setCursor(v=>(v+1)%ordered.length);}
   if(event.key==="ArrowUp"){event.preventDefault();setCursor(v=>(v-1+ordered.length)%ordered.length);}
   if(event.key==="Enter"&&document.activeElement===document.body){event.preventDefault();onNavigate(ordered[cursor].view);}
  }
  document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key);
 },[cursor,onNavigate]);
 const now=new Date();
 return <div className="tp-gateway" aria-label="Gateway of Chamber">
  <section className="tp-gateway-info tp-sheet">
   <div className="tp-info-label">ACTIVE FIRM</div><strong>{workspace.firm.name}</strong>
   <div className="tp-info-label">FINANCIAL YEAR</div><strong>{getFY(now)}</strong>
   <div className="tp-info-label">CURRENT DATE</div><strong>{now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</strong>
   <div className="tp-info-label">ACTIVE CLIENTS</div><strong>{workspace.clients.length}</strong>
   <div className="tp-info-label">PENDING SUBMISSIONS</div><strong>{pendingCount}</strong>
   <div className="tp-info-label">UNASSIGNED TASKS</div><strong>{unassigned}</strong>
   {preview&&<p className="tp-preview-note">Fictional data · read-only preview</p>}
  </section>
  <section className="tp-gateway-menu tp-sheet">
   <div className="tp-panel-title tp-center">Gateway of Chamber</div>
   {sections.map(section=><div key={section.label} className="tp-menu-section">
    <div className="tp-menu-group">{section.label}</div>
    {section.items.map(item=>{
     const index=ordered.indexOf(item);
     return <button key={item.label} type="button" className={"tp-menu-item"+(index===cursor?" tp-selected":"")} onMouseEnter={()=>setCursor(index)} onFocus={()=>setCursor(index)} onClick={()=>onNavigate(item.view)}>{item.label}</button>;
    })}
   </div>)}
  </section>
 </div>;
}

type GridProps=Props & {onOpenRecord:(view:View)=>void};
export function TallyDataGrid({workspace,onNavigate,onOpenRecord,preview}:GridProps){
 const months=useMemo(allPeriods,[]);
 const [row,setRow]=useState(0);
 const [col,setCol]=useState(3);
 const [clientFilter,setClientFilter]=useState("");
 const [onlyPending,setOnlyPending]=useState(false);
 const clients=useMemo(()=>workspace.clients.filter(c=>c.name.toLowerCase().includes(clientFilter.toLowerCase())&&(!onlyPending||workspace.documents.some(d=>d.client_id===c.id&&pending(d)))),[workspace,clientFilter,onlyPending]);
 const selected=clients[Math.max(0,Math.min(row,clients.length-1))];
 const selectedPeriod=months[col]&&monthKey(months[col]);
 const docsFor=(cid:string,period:string)=>{
  const taskIDs=new Set(workspace.tasks.filter(t=>t.client_id===cid&&t.period===period).map(t=>t.id));
  return workspace.documents.filter(d=>d.client_id===cid&&taskIDs.has(d.task_id));
 };
 function cell(cid:string,month:string){
  const docs=docsFor(cid,month);
  if(!docs.length)return "–";
  const complete=docs.filter(d=>!pending(d)).length;
  return (complete===docs.length?"✓ ":complete===0?"✕ ":"◐ ")+complete+"/"+docs.length;
 }
 const selectedDocs=selected&&selectedPeriod?docsFor(selected.id,selectedPeriod):[];
 useEffect(()=>{
  function onKey(event:KeyboardEvent){
   if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement||event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==="ArrowDown"){event.preventDefault();setRow(v=>Math.min(v+1,Math.max(0,clients.length-1)));}
   if(event.key==="ArrowUp"){event.preventDefault();setRow(v=>Math.max(0,v-1));}
   if(event.key==="ArrowRight"){event.preventDefault();setCol(v=>Math.min(months.length-1,v+1));}
   if(event.key==="ArrowLeft"){event.preventDefault();setCol(v=>Math.max(0,v-1));}
   if(event.key==="Enter"){event.preventDefault();onOpenRecord("tracker");}
  }
  document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey);
 },[clients.length,months.length,onOpenRecord]);
 return <div className="tp-report">
   <div className="tp-report-head">
    <span>Period: <b>FY {getFY(new Date())}</b> · Client: <b>{clientFilter||"All"}</b> · Status: <b>{onlyPending?"Pending":"All"}</b></span>
    <div className="tp-report-filters"><label>Client <input value={clientFilter} onChange={e=>{setClientFilter(e.target.value);setRow(0)}} placeholder="Filter..." aria-label="Filter clients"/></label><label><input type="checkbox" checked={onlyPending} onChange={e=>{setOnlyPending(e.target.checked);setRow(0)}}/> Pending only</label></div>
   </div>
   <div className="tp-report-layout">
    <div className="tp-sheet tp-report-grid"><table><thead><tr><th>Particulars</th>{months.map(m=><th key={monthKey(m)} className="tp-num">{monthLabel(m)}</th>)}<th className="tp-num">Pending</th></tr></thead><tbody>
     {clients.map((c,ri)=><tr key={c.id}><td className={ri===row?"tp-selected":""}><button className="tp-cell-button" onClick={()=>setRow(ri)}>{c.name}</button></td>{months.map((m,mi)=><td key={monthKey(m)} className={"tp-num "+(ri===row&&mi===col?"tp-selected":"")}><button className="tp-cell-button" onClick={()=>{setRow(ri);setCol(mi)}} onDoubleClick={()=>onOpenRecord("tracker")}>{cell(c.id,monthKey(m))}</button></td>)}<td className="tp-num">{workspace.documents.filter(d=>d.client_id===c.id&&pending(d)).length}</td></tr>)}
     <tr className="tp-total"><td>Total pending items</td>{months.map(m=><td key={monthKey(m)} className="tp-num">{workspace.documents.filter(d=>workspace.tasks.some(t=>t.id===d.task_id&&t.period===monthKey(m))&&pending(d)).length}</td>)}<td className="tp-num">{workspace.documents.filter(pending).length}</td></tr>
     </tbody></table>
     {clients.length===0&&<p className="tp-empty">No clients match this filter.</p>}
    </div>
    <aside className="tp-sheet tp-detail-pane"><div className="tp-panel-title">{selected?selected.name+" · "+monthLabel(months[col]):"No client"}</div>
      <div className="tp-detail-body">{selectedDocs.length?selectedDocs.map(d=><div key={d.id} className="tp-detail-line"><span>{d.status==="verified"||d.status==="received"?"✓":d.status==="not_applicable"?"–":"✕"} {d.name}</span><span>{statusName[d.status]??d.status}</span></div>):<p>No document requirements in this period.</p>}
       <button type="button" className="tp-small-link" onClick={()=>onNavigate("tracker")}>Open Data Received / full tracker</button>
      </div>
    </aside>
   </div>
   <p className="tp-subnote">{preview?"Read-only sample. ":""}Select a cell with ↑↓←→, Enter opens the detailed register.</p>
  </div>;
}

export function TallyTaskRegister({workspace,onOpen}:Props&{onOpen:(task:Task)=>void}){
 const [row,setRow]=useState(0);
 const tasks=workspace.tasks;
 const staff=(id:string|null)=>workspace.staff.find(s=>s.id===id)?.name||"— Unassigned —";
 useEffect(()=>{
  function onKey(e:KeyboardEvent){
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.altKey||e.ctrlKey||e.metaKey)return;
   if(e.key==="ArrowDown"){e.preventDefault();setRow(v=>Math.min(tasks.length-1,v+1));}
   if(e.key==="ArrowUp"){e.preventDefault();setRow(v=>Math.max(0,v-1));}
   if(e.key==="Enter"&&tasks[row]){e.preventDefault();onOpen(tasks[row]);}
  }
  document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey);
 },[tasks,row,onOpen]);
 return <div className="tp-sheet tp-task-sheet">
  <div className="tp-panel-title">Task Allocation</div>
  <table><thead><tr><th>Task</th><th>Client</th><th>Staff</th><th>Due</th><th>Status</th></tr></thead><tbody>{tasks.map((t,i)=><tr key={t.id} className={i===row?"tp-selected":""} onClick={()=>setRow(i)} onDoubleClick={()=>onOpen(t)}><td>{t.title}</td><td>{clientName(workspace,t.client_id)}</td><td>{staff(t.assignee_id)}</td><td>{t.due_date??"—"}</td><td>{t.status.replaceAll("_"," ")}</td></tr>)}</tbody></table>
  <div className="tp-task-foot">Unassigned: {tasks.filter(t=>!t.assignee_id).length} · Total tasks: {tasks.length} · Enter opens assignment details</div>
 </div>;
}
