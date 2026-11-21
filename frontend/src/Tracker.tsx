import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, ClipboardCopy, Inbox, RefreshCw, X } from "lucide-react";
import { getTracker, getTrackerDetail, patchDocument, saveInwardReceipt } from "./api";
import type { DocumentStatus, TrackerCell, TrackerClient, TrackerDetail, TrackerSummary, Workspace } from "./types";

const monthShort=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const stateName:Record<string,string>={complete:"Complete",partial:"Partial",missing:"Missing",not_due:"Not due",unconfigured:"No checklist"};
const stateGlyph:Record<string,string>={complete:"✓",partial:"◐",missing:"✕",not_due:"—",unconfigured:"?"};
function fyStart(){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).formatToParts(new Date());
 const y=Number(parts.find(p=>p.type==="year")?.value||2026),m=Number(parts.find(p=>p.type==="month")?.value||4);
 return String(m>=4?y:y-1)+"-04";
}
function monthsFrom(start:string){
 const [year,month]=start.split("-").map(Number);
 return Array.from({length:12},(_,i)=>{
  const date=new Date(Date.UTC(year,month-1+i,1));
  return date.toISOString().slice(0,7);
 });
}
function prettyMonth(period:string){const [y,m]=period.split("-").map(Number);return monthShort[(m||1)-1]+" "+y;}
function getPeriod(period:string|null){
 if(!period)return null;
 if(/^\d{4}-\d{2}$/.test(period))return period;
 const match=/^([A-Za-z]{3})\s+(\d{4})$/.exec(period);
 if(!match)return null;
 const m=monthShort.findIndex(x=>x.toLowerCase()===match[1].toLowerCase());
 return m<0?null:match[2]+"-"+String(m+1).padStart(2,"0");
}
function statusFor(tasks:number,total:number,received:number,waived:number):TrackerCell["state"]{
 if(!tasks)return "not_due";
 if(!total)return "unconfigured";
 const required=Math.max(0,total-waived);
 return received>=required?"complete":received>0?"partial":"missing";
}
function previewData(workspace:Workspace,from:string,service:string):TrackerSummary{
 const periods=monthsFrom(from);
 const clients:TrackerClient[]=workspace.clients.map(client=>({
  id:client.id,name:client.name,category:client.category,
  cells:periods.map(period=>{
   const tasks=workspace.tasks.filter(t=>t.client_id===client.id&&getPeriod(t.period)===period&&(!service||t.service===service));
   const docs=workspace.documents.filter(d=>tasks.some(t=>t.id===d.task_id));
   const received=docs.filter(d=>["received","verified"].includes(d.status)).length;
   const waived=docs.filter(d=>d.status==="not_applicable").length;
   return {period,state:statusFor(tasks.length,docs.length,received,waived),tasks:tasks.length,total:docs.length,received,waived};
  })
 }));
 return {periods,clients,page:0,has_more:false,service:service||null};
}
function previewDetail(workspace:Workspace,clientId:string,period:string):TrackerDetail{
 const client=workspace.clients.find(c=>c.id===clientId);
 const tasks=workspace.tasks.filter(t=>t.client_id===clientId&&getPeriod(t.period)===period);
 const docs=workspace.documents.filter(d=>tasks.some(t=>t.id===d.task_id));
 return {
  client:{id:clientId,name:client?.name??"Client"},period,
  tasks:tasks.map(t=>({id:t.id,title:t.title,service:t.service,status:t.status,due_date:t.due_date,ask_by_date:null})),
  documents:docs.map(d=>({...d,received_at:d.received_at??null,verified_at:d.verified_at??null,received_via:null,receipt_note:null}))
 };
}
function isReceived(status:DocumentStatus){return status==="received"||status==="verified"||status==="not_applicable"}
function dateLabel(input:string|null){if(!input)return "—";const d=new Date(input+"T12:00:00");return Number.isNaN(d.getTime())?input:d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}

export default function DataTracker({workspace,preview}:{workspace:Workspace;preview:boolean}){
 const [from,setFrom]=useState(fyStart);
 const [service,setService]=useState("");
 const [page,setPage]=useState(0);
 const [summary,setSummary]=useState<TrackerSummary|null>(null);
 const [selection,setSelection]=useState<{clientId:string;period:string}|null>(null);
 const [detail,setDetail]=useState<TrackerDetail|null>(null);
 const [checked,setChecked]=useState<string[]>([]);
 const [receivedVia,setReceivedVia]=useState("email");
 const [note,setNote]=useState("");
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [revision,setRevision]=useState(0);
 const table=useRef<HTMLTableElement>(null);
 const services=useMemo(()=>Array.from(new Set([...workspace.templates.map(t=>t.service),...workspace.tasks.map(t=>t.service)])).filter(Boolean).sort(),[workspace]);

 useEffect(()=>{
  let active=true;
  if(preview){setSummary(previewData(workspace,from,service));setLoading(false);return}
  setLoading(true);setError("");
  void getTracker(from,service,page).then(result=>{if(active)setSummary(result)}).catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[from,service,page,preview,workspace,revision]);

 useEffect(()=>{
  let active=true;setChecked([]);
  if(!selection){setDetail(null);return}
  if(preview){setDetail(previewDetail(workspace,selection.clientId,selection.period));return}
  setDetail(null);
  void getTrackerDetail(selection.clientId,selection.period).then(result=>{if(active)setDetail(result)}).catch(e=>{if(active)setError(String(e))});
  return()=>{active=false};
 },[selection,preview,workspace,revision]);

 const years=Number(from.slice(0,4));
 const editable=!preview;
 const canWaive=workspace.user.role==="manager"||workspace.user.role==="principal";
 const chosen=selection&&detail?.client.id===selection.clientId&&detail.period===selection.period?detail:null;

 function focusCell(row:number,col:number){
  if(!summary)return;
  const r=Math.max(0,Math.min(summary.clients.length-1,row));
  const c=Math.max(0,Math.min(summary.periods.length-1,col));
  table.current?.querySelector<HTMLButtonElement>('button[data-row="'+r+'"][data-col="'+c+'"]')?.focus();
 }
 function cellKeys(e:KeyboardEvent<HTMLButtonElement>,row:number,col:number){
  if(e.key==="ArrowRight"){e.preventDefault();focusCell(row,col+1)}
  else if(e.key==="ArrowLeft"){e.preventDefault();focusCell(row,col-1)}
  else if(e.key==="ArrowDown"){e.preventDefault();focusCell(row+1,col)}
  else if(e.key==="ArrowUp"){e.preventDefault();focusCell(row-1,col)}
  else if(["r","R","m","M"].includes(e.key)){
   e.preventDefault();const clientId=summary?.clients[row]?.id,period=summary?.periods[col];
   if(clientId&&period){setSelection({clientId,period});setNotice(e.key.toLowerCase()==="r"?"Open request draft in the detail panel.":"Choose received items in the detail panel.")}
  }
 }
 async function copyRequest(){
  if(!chosen)return;
  const missing=chosen.documents.filter(d=>!isReceived(d.status));
  if(!missing.length){setNotice("No missing documents to request.");return}
  const text="Dear "+chosen.client.name+",\n\nPlease share the following documents for "+prettyMonth(chosen.period)+":\n"+
   missing.map((d,i)=>(i+1)+". "+d.name).join("\n")+
   "\n\nThank you,\n"+workspace.firm.name;
  try{await navigator.clipboard.writeText(text);setNotice("Request copied as a draft. Nothing has been sent.")}
  catch{setError("Clipboard unavailable. Please copy the request manually.")}
 }
 async function saveReceipts(){
  if(!editable||!selection||!checked.length||busy)return;
  setBusy(true);setError("");
  try{
   const result=await saveInwardReceipt(selection.clientId,selection.period,checked,receivedVia,note);
   setNotice(result.received+" requirements marked received.");
   setNote("");setChecked([]);setRevision(v=>v+1);
  }catch(e){setError(String(e))}finally{setBusy(false)}
 }
 async function waive(id:string){
  if(!editable||!canWaive||busy)return;
  setBusy(true);setError("");
  try{await patchDocument(id,"not_applicable");setNotice("Requirement marked not applicable.");setRevision(v=>v+1)}
  catch(e){setError(String(e))}finally{setBusy(false)}
 }

 const tally=summary?.clients.flatMap(c=>c.cells)??[];
 const missing=tally.filter(c=>c.state==="missing").length,partial=tally.filter(c=>c.state==="partial").length,complete=tally.filter(c=>c.state==="complete").length;
 return <section className="tracker-screen">
  <div className="tracker-heading">
   <div><h1>Client Data Tracker</h1><p>Financial-year document status · Client × month</p></div>
   <div className="tracker-heading-actions">
    <label>Financial year <select value={from} onChange={e=>{setFrom(e.target.value);setPage(0);setSelection(null)}}>
     {Array.from({length:7},(_,i)=>years-3+i).map(y=><option key={y} value={y+"-04"}>{y}–{String(y+1).slice(-2)}</option>)}
    </select></label>
    <label>Service <select value={service} onChange={e=>{setService(e.target.value);setPage(0);setSelection(null)}}>
     <option value="">All services</option>{services.map(s=><option key={s} value={s}>{s}</option>)}
    </select></label>
    <button type="button" className="tracker-btn" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={15}/> Refresh</button>
   </div>
  </div>
  {preview&&<div className="tracker-notice">Read-only sample workspace — all names and records are fictional.</div>}
  <div className="tracker-summary" aria-label="Current page summary">
   <span><strong>{summary?.clients.length??0}</strong> clients on page</span>
   <span className="tracker-state missing"><strong>{missing}</strong> missing periods</span>
   <span className="tracker-state partial"><strong>{partial}</strong> partial periods</span>
   <span className="tracker-state complete"><strong>{complete}</strong> complete periods</span>
  </div>
  {error&&<div role="alert" className="alert">{error}</div>}
  {notice&&<div role="status" className="tracker-notice">{notice}</div>}
  {loading&&<p className="tracker-loading">Loading financial-year data…</p>}
  <div className="tracker-layout">
   <div className="tracker-grid-outer">
    <div className="tracker-grid-scroll">
     <table ref={table} className="tracker-grid">
      <thead><tr><th scope="col" className="tracker-client-col">Client</th>
       {(summary?.periods??monthsFrom(from)).map(period=><th scope="col" key={period}>{monthShort[Number(period.slice(5))-1]}<span>{period.slice(2,4)}</span></th>)}
      </tr></thead>
      <tbody>
       {summary?.clients.map((client,r)=><tr key={client.id}>
        <th scope="row" className="tracker-client-col"><strong>{client.name}</strong><small>{client.category}</small></th>
        {client.cells.map((cell,col)=><td key={cell.period}>
         <button type="button" data-row={r} data-col={col} className={"tracker-cell "+cell.state+
           (selection?.clientId===client.id&&selection.period===cell.period?" selected":"")}
          title={stateName[cell.state]+": "+cell.received+"/"+Math.max(0,cell.total-cell.waived)+" required items"}
          aria-label={client.name+", "+prettyMonth(cell.period)+", "+stateName[cell.state]+", "+cell.received+" received of "+Math.max(0,cell.total-cell.waived)}
          onKeyDown={e=>cellKeys(e,r,col)}
          onClick={()=>setSelection({clientId:client.id,period:cell.period})}>
          <strong aria-hidden="true">{stateGlyph[cell.state]}</strong>
          <small>{cell.state==="not_due"?"—":cell.state==="unconfigured"?"Setup":cell.received+"/"+Math.max(0,cell.total-cell.waived)}</small>
         </button>
        </td>)}
       </tr>)}
       {summary?.clients.length===0&&!loading&&<tr><td colSpan={13} className="tracker-empty">No matching clients yet. Add clients and enroll them in recurring services to begin tracking.</td></tr>}
      </tbody>
     </table>
    </div>
    <footer className="tracker-grid-footer">
     <span>Arrow keys move · Enter opens · R requests · M enters receipts</span>
     <div className="tracker-pager">
      <button type="button" disabled={page===0||preview} onClick={()=>{setPage(p=>Math.max(0,p-1));setSelection(null)}}><ArrowLeft size={15}/> Previous</button>
      <span>Page {page+1}</span>
      <button type="button" disabled={!summary?.has_more||preview} onClick={()=>{setPage(p=>p+1);setSelection(null)}}>Next <ArrowRight size={15}/></button>
     </div>
    </footer>
    <div className="tracker-legend" aria-label="Status legend">
     {(["complete","partial","missing","unconfigured","not_due"] as const).map(s=><span key={s} className={"tracker-state "+s}><strong>{stateGlyph[s]}</strong> {stateName[s]}</span>)}
    </div>
   </div>
   <aside className="tracker-detail" aria-label="Selected client and month">
    {!selection?<div className="tracker-detail-empty"><CircleHelp size={22}/><h2>Select a client and month</h2><p>Open any cell to inspect required documents, receipt dates and missing information.</p></div>:
    !chosen?<div className="tracker-detail-empty"><p>Loading checklist…</p><button onClick={()=>setSelection(null)}>Close</button></div>:
    <>
     <header className="tracker-detail-header">
      <div><span>MONTHLY DATA</span><h2>{chosen.client.name}</h2><p>{prettyMonth(chosen.period)}</p></div>
      <button type="button" aria-label="Close details" onClick={()=>setSelection(null)}><X size={19}/></button>
     </header>
     <div className="tracker-detail-dates">{chosen.tasks.length===0?<p>No work is scheduled for this month.</p>:
      chosen.tasks.map(t=><div key={t.id}><strong>{t.service}</strong><span>{t.title}</span><small>Ask by {dateLabel(t.ask_by_date)} · Due {dateLabel(t.due_date)}</small></div>)}</div>
     <div className="tracker-detail-toolbar"><h3>Required documents <span>({chosen.documents.length})</span></h3>
      <button type="button" className="tracker-btn" disabled={!chosen.documents.some(d=>!isReceived(d.status))} onClick={()=>void copyRequest()}><ClipboardCopy size={14}/> Copy request</button>
     </div>
     <p className="tracker-hint">Copying creates a draft only; no email or WhatsApp message is sent.</p>
     <div className="tracker-requirements">
      {chosen.documents.length===0&&<div className="tracker-detail-empty"><p>No checklist items configured for this period.</p><p>Use Compliance → Add requirement to define a reusable checklist.</p></div>}
      {chosen.documents.map(d=><div key={d.id} className="tracker-requirement">
       <label><input type="checkbox" disabled={!editable||isReceived(d.status)||busy} checked={checked.includes(d.id)}
         onChange={e=>setChecked(prev=>e.target.checked?[...prev,d.id]:prev.filter(x=>x!==d.id))}/>
        <span><strong>{d.name}</strong><small>{d.status.replaceAll("_"," ")}{d.received_at?" · "+dateLabel(d.received_at):""}{d.received_via?" · "+d.received_via:""}</small></span>
       </label>
       {canWaive&&editable&&!isReceived(d.status)&&<button type="button" className="tracker-link" disabled={busy} onClick={()=>void waive(d.id)}>N/A</button>}
      </div>)}
     </div>
     <div className="tracker-inward">
      <h3><Inbox size={16}/> Inward entry</h3>
      <label>Received via<select value={receivedVia} onChange={e=>setReceivedVia(e.target.value)} disabled={!editable}>
       <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="courier">Courier</option><option value="in_person">In person</option><option value="portal">Client portal</option><option value="other">Other</option>
      </select></label>
      <label>Notes<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="Optional receipt reference" disabled={!editable}/></label>
      <button type="button" className="tracker-btn primary" disabled={!editable||!checked.length||busy} onClick={()=>void saveReceipts()}><CheckCircle2 size={15}/> Mark {checked.length||"selected"} received</button>
     </div>
    </>}
   </aside>
  </div>
 </section>;
}
