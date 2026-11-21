import { useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Clock, FileWarning, RefreshCw, Users, X } from "lucide-react";
import { getInsightDrill, getInsights } from "./api";
import type { DashboardReport, DrillReport, ReportKind, View } from "./types";

const cards:Array<{key:ReportKind;label:string;sub:string;icon:typeof Clock}>=[
 {key:"due_soon",label:"Due in 7 days",sub:"Upcoming open assignments",icon:CalendarClock},
 {key:"overdue",label:"Past due",sub:"Open work beyond planned deadline",icon:AlertCircle},
 {key:"missing",label:"Missing data items",sub:"Required client information",icon:FileWarning},
 {key:"unassigned",label:"Unassigned tasks",sub:"Waiting for allocation",icon:Users},
 {key:"review",label:"Awaiting review",sub:"Tasks submitted for approval",icon:ClipboardList},
 {key:"waiting",label:"Waiting on client",sub:"Work marked as waiting",icon:Clock}
];
const formatDate=(v?:string|null)=>v?new Date(v.length===10?v+"T12:00:00":v).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
function shortTime(value:string){const d=new Date(value);return isNaN(d.getTime())?value:d.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});}
export default function Insights({preview,demoCount,onNavigate}:{
 preview:boolean;demoCount?:number;onNavigate:(view:View)=>void
}){
 const [data,setData]=useState<DashboardReport|null>(null);
 const [drill,setDrill]=useState<DrillReport|null>(null);
 const [selected,setSelected]=useState<ReportKind|null>(null);
 const [page,setPage]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;
  if(preview)return;
  setBusy(true);setError("");
  void getInsights().then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[preview,version]);
 useEffect(()=>{
  let active=true;
  if(!selected||preview){setDrill(null);return}
  void getInsightDrill(selected,page).then(r=>{if(active)setDrill(r)}).catch(e=>{if(active)setError(String(e))});
  return()=>{active=false};
 },[selected,page,preview,version]);
 function open(kind:ReportKind){setSelected(kind);setPage(0);setDrill(null)}
 return <section className="insights-page">
  <header className="insights-heading">
   <div><h1>Practice Dashboard</h1><p>Operational visibility from firm records. All counts are calculated by the server, not from capped client-side tables.</p></div>
   <button type="button" className="tracker-btn" disabled={busy||preview} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={15}/> Refresh</button>
  </header>
  {preview&&<div className="tracker-notice">Sample mode is read-only. Live query-backed analytics require a firm sign-in. {demoCount??0} fictional tasks in preview.</div>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {busy&&!data&&<p>Loading practice report…</p>}
  {data&&<>
   <p className="insights-date">As of {formatDate(data.today)} · India Standard Time · Upcoming window through {formatDate(data.through)}</p>
   <div className="insights-kpis">
    {cards.map(card=><button type="button" key={card.key} className={"insights-kpi "+card.key}
      onClick={()=>open(card.key)} aria-label={card.label+": "+data.kpis[card.key]+". Show matching records"}>
     <span className="insights-kpi-title"><card.icon size={17}/>{card.label}</span>
     <strong>{data.kpis[card.key].toLocaleString("en-IN")}</strong><span className="insights-kpi-description">{card.sub}</span>
    </button>)}
   </div>
   <div className="insights-columns">
    <section className="insights-panel">
     <header><h2><CalendarClock size={16}/> Upcoming deadlines</h2><button onClick={()=>open("due_soon")}>View due work</button></header>
     <div className="insights-scroll">
      <table><thead><tr><th>Client / service</th><th>Assignment</th><th>Due</th><th>Owner</th></tr></thead>
      <tbody>
       {data.deadlines.map(row=><tr key={row.id}>
        <td><strong>{row.client_name}</strong><small>{row.service} · {row.period||"—"}</small></td>
        <td>{row.title}</td><td>{formatDate(row.due_date)}</td><td>{row.assignee_name||"Unassigned"}</td>
       </tr>)}
       {!data.deadlines.length&&<tr><td colSpan={4}>No scheduled open tasks.</td></tr>}
      </tbody></table>
     </div>
    </section>
    <section className="insights-panel">
     <header><h2><Users size={16}/> Team distribution</h2><button onClick={()=>onNavigate("board")}>Open board</button></header>
     <div className="insights-team">
      {data.workload.map(m=><div key={m.id} className="insights-person">
       <div><strong>{m.name}</strong><small>{m.role} · {m.open_tasks} open assignments</small></div>
       <div className="insights-meter"><div><span style={{width:Math.min(m.load_percent,100)+"%"}}/></div><small>{m.load_percent}% of weekly capacity</small></div>
      </div>)}
      {!data.workload.length&&<p>No active team members.</p>}
     </div>
     <p className="insights-advisory">Capacity is estimated from task effort, not surveillance or employee activity monitoring.</p>
    </section>
   </div>
   <div className="insights-columns">
    <section className="insights-panel">
     <header><h2><ClipboardList size={16}/> Work by service</h2></header>
     <table><thead><tr><th>Service</th><th>Tasks</th><th>Completed</th><th>Overdue</th></tr></thead>
     <tbody>{data.services.map(s=><tr key={s.service}><td>{s.service}</td><td>{s.total}</td><td>{s.done}</td><td>{s.overdue}</td></tr>)}
      {!data.services.length&&<tr><td colSpan={4}>No recorded services yet.</td></tr>}
     </tbody></table>
     <div className="insights-secondary-metric"><Clock size={16}/> Median responsiveness is not yet calculated. Mean observed request-to-receipt: <strong>{data.responsiveness.avg_response_days===null?"—":data.responsiveness.avg_response_days+" days"}</strong> ({data.responsiveness.received_count} received items).</div>
    </section>
    <section className="insights-panel">
     <header><h2><Activity size={16}/> Recent activity</h2><button onClick={()=>onNavigate("activity")}>Activity log</button></header>
     <div className="insights-feed">
      {data.activity.map(e=><div key={e.id}><CheckCircle2 size={14}/><span><strong>{e.actor_name||"Automation"}</strong> {e.event} {e.entity_type}<small>{shortTime(e.at)}</small></span></div>)}
      {!data.activity.length&&<p>No activity recorded.</p>}
     </div>
    </section>
   </div>
   {selected&&<div className="insights-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target){setSelected(null);setDrill(null)}}}>
    <section className="insights-modal" role="dialog" aria-modal="true" aria-label="Report matching records">
     <header><div><h2>{cards.find(c=>c.key===selected)?.label}</h2><p>Records matching the dashboard count</p></div>
      <button type="button" onClick={()=>{setSelected(null);setDrill(null)}} aria-label="Close report"><X size={18}/></button></header>
     <div className="insights-scroll"><table><thead><tr><th>Client</th><th>Item</th><th>Service / period</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>{drill?.rows.map(r=><tr key={r.id}><td>{r.client_name}</td><td>{r.title}</td><td>{r.service} · {r.period||"—"}</td><td>{r.status}</td><td>{formatDate(r.due_date)}</td></tr>)}
       {drill?.rows.length===0&&<tr><td colSpan={5}>No matching records.</td></tr>}
      </tbody></table></div>
     <footer><span>{drill?drill.total+" total matching records":"Loading…"}</span><div>
      <button disabled={page===0} onClick={()=>setPage(n=>Math.max(0,n-1))}><ArrowLeft size={14}/> Prev</button>
      <span>Page {page+1}</span>
      <button disabled={!drill||drill.rows.length<50||(page+1)*50>=drill.total} onClick={()=>setPage(n=>n+1)}>Next <ArrowRight size={14}/></button>
     </div></footer>
    </section>
   </div>}
  </>}
 </section>;
}
