import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import PortalNotifications from "./PortalNotifications";
import { Check, CheckCheck, ClipboardList, Clock, MessageSquare, Play, Square, UserRound, X } from "lucide-react";
import { addTaskComment, assignTask, getTaskComments, getTaskHistory, getTaskTime, getWorkload, patchTask, reviewTask, toggleTaskTimer } from "./api";
import type { Task, TaskComment, TaskHistoryEvent, TimerEntry, WorkloadMember, Workspace } from "./types";

type Mode="board"|"myday";
type Lane="unassigned"|"assigned"|"waiting"|"review"|"done";
const lanes:{id:Lane;title:string;description:string}[]=[
 {id:"unassigned",title:"Unassigned",description:"Needs an owner"},
 {id:"assigned",title:"Assigned",description:"Pending and in progress"},
 {id:"waiting",title:"Waiting on client",description:"Blocked on requested data"},
 {id:"review",title:"In review",description:"Ready for a reviewer"},
 {id:"done",title:"Done today",description:"Recently completed"}
];
const date=(s?:string|null)=>!s?"—":new Date(s.length===10?s+"T12:00:00":s).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
const fmt=(s:string)=>s.replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function whichLane(t:Task):Lane{
 if(t.status==="done")return "done";
 if(t.status==="review")return "review";
 if(t.status==="waiting")return "waiting";
 if(!t.assignee_id)return "unassigned";
 return "assigned";
}
export default function WorkBoard({workspace,preview,mode,onRefresh}:{
 workspace:Workspace;preview:boolean;mode:Mode;onRefresh:()=>Promise<void>
}){
 const privileged=workspace.user.role==="principal"||workspace.user.role==="manager";
 const [activeId,setActiveId]=useState<string|null>(null);
 const [checked,setChecked]=useState<string[]>([]);
 const [assignTo,setAssignTo]=useState("");
 const [reviewer,setReviewer]=useState("");
 const [commentDraft,setCommentDraft]=useState("");
 const [reviewNote,setReviewNote]=useState("");
 const [comments,setComments]=useState<TaskComment[]>([]);
 const [history,setHistory]=useState<TaskHistoryEvent[]>([]);
 const [time,setTime]=useState<TimerEntry[]>([]);
 const [workload,setWorkload]=useState<WorkloadMember[]>([]);
 const [assignOpen,setAssignOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [refresh,setRefresh]=useState(0);
 const current=workspace.tasks.find(t=>t.id===activeId);
 const tasks=useMemo(()=>workspace.tasks.filter(t=>mode==="board"||t.assignee_id===workspace.user.id),[workspace,mode]);
 const fullName=(id:string|null)=>workspace.staff.find(u=>u.id===id)?.name||"Unassigned";
 const clientName=(id:string)=>workspace.clients.find(c=>c.id===id)?.name||"Unknown client";
 const completedToday=today();
 const visibleLanes=mode==="myday"?lanes.filter(l=>l.id!=="unassigned"):lanes;
 const laneItems=(lane:Lane)=>tasks.filter(t=>whichLane(t)===lane&&(lane!=="done"||!t.completed_at||t.completed_at.slice(0,10)===completedToday));
 const allSelected=tasks.filter(t=>checked.includes(t.id));
 const activeTime=time.some(t=>t.user_id===workspace.user.id&&!t.stopped_at);
 const workloadFor=(id:string|null)=>workload.find(m=>m.id===id);
 useEffect(()=>{
  let alive=true;
  if(preview||!privileged||mode!=="board")return;
  void getWorkload().then(r=>{if(alive)setWorkload(r.members)}).catch(e=>{if(alive)setError(String(e))});
  return()=>{alive=false};
 },[preview,privileged,mode,refresh]);
 useEffect(()=>{
  let alive=true;setError("");
  const t=workspace.tasks.find(t=>t.id===activeId);
  if(!t){setHistory([]);setComments([]);setTime([]);return}
  setAssignTo(t.assignee_id??"");setReviewer(t.reviewer_id??"");setAssignOpen(false);
  if(preview){setHistory([]);setComments([]);setTime([]);return}
  void Promise.all([getTaskComments(t.id),getTaskHistory(t.id),getTaskTime(t.id)])
   .then(([c,h,tm])=>{if(alive){setComments(c.comments);setHistory(h.events);setTime(tm.entries)}})
   .catch(e=>{if(alive)setError(String(e))});
  return()=>{alive=false};
 },[activeId,workspace,preview,refresh]);
 async function doAction(action:()=>Promise<unknown>,success:string){
  if(preview)return;
  setBusy(true);setError("");setMessage("");
  try{
   await action();await onRefresh();setRefresh(n=>n+1);setMessage(success);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function saveAssignment(){
  if(!privileged||preview||busy)return;
  const selectedIds=checked.length?allSelected.map(t=>t.id):current?[current.id]:[];
  if(!selectedIds.length)return;
  await doAction(async()=>{
   for(const id of selectedIds)await assignTask(id,assignTo||null,reviewer||null);
  },selectedIds.length+" assignments updated.");
  setChecked([]);setAssignOpen(false);
 }
 function toggleChecked(id:string){setChecked(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 function cardKeys(e:KeyboardEvent<HTMLButtonElement>,taskId:string){
  if(e.key.toLowerCase()==="a"&&privileged&&!preview){e.preventDefault();setActiveId(taskId);setAssignOpen(true)}
  if(e.key===" "){e.preventDefault();toggleChecked(taskId)}
 }
 const outstanding=tasks.filter(t=>t.status!=="done").length;
 return <section className="board-screen">
  <div className="board-heading"><div><h1>{mode==="myday"?"My Day":"Work Board"}</h1>
   <p>{mode==="myday"?"Your assigned work, reviews and recorded time":"Assign, review and follow up on all firm work"}</p></div>
   <div><strong>{outstanding}</strong><span> open assignments</span></div>
  </div>
  {preview&&<div className="board-banner">Fictional, read-only example. Changes are disabled.</div>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="board-banner" role="status">{message}</div>}
  {mode==="myday"&&<PortalNotifications preview={preview} onOpenTask={setActiveId}/>}
  {privileged&&mode==="board"&&workload.length>0&&<section className="board-people" aria-label="Assignment capacity">
   <h2>Team workload <small>Next 14 days</small></h2>
   <div className="board-people-list">{workload.map(m=><div key={m.id} className="board-person">
    <div><strong>{m.name}</strong><small>{m.work_state==="busy"?"Active Chamber work":"No active work recorded"}</small></div>
    <div className="board-load"><div><span style={{width:Math.min(100,m.load_percent)+"%"}}/></div><small>{m.load_percent}% of two-week nominal capacity</small></div>
   </div>)}</div>
   <p className="board-policy">Includes overdue and undated assignments. Estimates are based on nominal capacity, not actual availability or employee surveillance.</p>
  </section>}
  {privileged&&mode==="board"&&checked.length>0&&<div className="board-bulk">
   <span>{checked.length} selected</span><button onClick={()=>{setAssignOpen(true);setActiveId(checked[0])}} disabled={preview}>Assign selected</button>
   <button onClick={()=>setChecked([])}>Clear</button>
  </div>}
  <div className="board-layout">
   <div className="board-lanes" aria-label="Work status board">
    {visibleLanes.map(lane=><section key={lane.id} className="board-lane">
     <header><div><h2>{lane.title}</h2><p>{lane.description}</p></div><span>{laneItems(lane.id).length}</span></header>
     <div className="board-cards">
      {laneItems(lane.id).length===0&&<p className="board-lane-empty">No assignments</p>}
      {laneItems(lane.id).map(task=><article key={task.id} className={"board-card"+(activeId===task.id?" selected":"")}>
       <button type="button" className="board-card-main" onClick={()=>setActiveId(task.id)} onKeyDown={e=>cardKeys(e,task.id)}
        aria-label={task.title+", "+clientName(task.client_id)+", "+fmt(task.status)}>
        <span className="board-card-meta">{task.service} · {task.period||"No period"}</span>
        <strong>{task.title}</strong><span className="board-card-client">{clientName(task.client_id)}</span>
        <span className="board-card-footer"><span className={task.priority==="high"?"urgent":""}>Due {date(task.due_date)}</span><span><UserRound size={12}/> {fullName(task.assignee_id)}</span></span>
       </button>
       {privileged&&mode==="board"&&<label className="board-select"><input type="checkbox" checked={checked.includes(task.id)} onChange={()=>toggleChecked(task.id)} aria-label={"Select "+task.title}/></label>}
      </article>)}
     </div>
    </section>)}
   </div>
   {current&&<aside className="board-detail" aria-label="Assignment details">
    <header><div><span>ASSIGNMENT</span><h2>{current.title}</h2><p>{clientName(current.client_id)} · {current.service}</p></div>
     <button type="button" aria-label="Close" onClick={()=>{setActiveId(null);setAssignOpen(false)}}><X size={17}/></button></header>
    <dl className="board-meta">
     <div><dt>Assigned to</dt><dd>{fullName(current.assignee_id)}</dd></div>
     <div><dt>Reviewer</dt><dd>{fullName(current.reviewer_id)}</dd></div>
     <div><dt>Period</dt><dd>{current.period||"—"}</dd></div>
     <div><dt>Ask by</dt><dd>{date(current.ask_by_date)}</dd></div>
     <div><dt>Due</dt><dd>{date(current.due_date)}</dd></div>
     <div><dt>Stage</dt><dd>{fmt(current.status)}</dd></div>
    </dl>
    {privileged&&<section className="board-section">
     <button type="button" className="tracker-btn" onClick={()=>setAssignOpen(v=>!v)} disabled={preview}>Assign / change reviewer</button>
     {assignOpen&&<div className="board-form">
      <label>Assignee <select value={assignTo} onChange={e=>setAssignTo(e.target.value)}>
       <option value="">Unassigned</option>{workspace.staff.map(p=><option key={p.id} value={p.id}>{p.name} {workloadFor(p.id)?.load_percent&&workloadFor(p.id)!.load_percent>100?"(overloaded)":""}</option>)}
      </select></label>
      <label>Reviewer <select value={reviewer} onChange={e=>setReviewer(e.target.value)}>
       <option value="">No reviewer</option>{workspace.staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <button type="button" className="tracker-btn primary" disabled={busy||preview} onClick={()=>void saveAssignment()}>Save assignment</button>
     </div>}
    </section>}
    {current.status!=="done"&&<section className="board-section">
     <h3>Status</h3><div className="board-status-actions">
      {(["todo","in_progress","waiting","blocked","review"] as const).map(status=><button key={status} disabled={busy||preview||current.status===status} onClick={()=>void doAction(()=>patchTask(current.id,status),"Status changed.")}>{fmt(status)}</button>)}
     </div>
    </section>}
    {current.status==="review"&&privileged&&<section className="board-section">
     <h3><CheckCheck size={15}/> Reviewer decision</h3>
     <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={3} placeholder="Review note or reason for returning work"/>
     <div className="board-actions">
      <button disabled={busy||preview} onClick={()=>void doAction(()=>reviewTask(current.id,"approve",reviewNote),"Task approved.")}><Check size={14}/> Approve</button>
      <button disabled={busy||preview||!reviewNote.trim()} onClick={()=>void doAction(()=>reviewTask(current.id,"return",reviewNote),"Task returned.")}>Return for changes</button>
     </div>
    </section>}
    {current.status!=="done"&&<section className="board-section">
     <h3><Clock size={15}/> Work timer</h3>
     <p className="board-policy">Only records time when you explicitly start and stop it.</p>
     <button className="tracker-btn" disabled={busy||preview} onClick={()=>void doAction(()=>toggleTaskTimer(current.id,activeTime?"stop":"start"),activeTime?"Timer stopped.":"Timer started.")}>
      {activeTime?<><Square size={13}/> Stop timer</>:<><Play size={13}/> Start timer</>}
     </button>
     <small className="board-policy">Recorded entries: {time.filter(t=>t.stopped_at).length}</small>
    </section>}
    <section className="board-section">
     <h3><MessageSquare size={15}/> Comments</h3>
     {comments.length===0?<p className="board-policy">No comments yet.</p>:comments.map(c=><div className="board-comment" key={c.id}><strong>{c.author}</strong><small>{date(c.created_at)}</small><p>{c.body}</p></div>)}
     <textarea value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} rows={2} placeholder="Add a work note…" disabled={preview}/>
     <button className="tracker-btn" disabled={preview||busy||!commentDraft.trim()} onClick={()=>void doAction(async()=>{await addTaskComment(current.id,commentDraft);setCommentDraft("")},"Comment added.")}>Add comment</button>
    </section>
    <section className="board-section">
     <h3><ClipboardList size={15}/> History</h3>
     {history.length===0?<p className="board-policy">No status history to show.</p>:history.map(e=><div key={e.id} className="board-event">
      <strong>{fmt(e.to_status)}</strong> <small>{date(e.at)}</small>
      <p>{e.actor_name??"Automation"}{e.note?" · "+e.note:""}</p></div>)}
    </section>
   </aside>}
  </div>
 </section>;
}
