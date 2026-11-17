import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity as ActivityIcon, ArrowDownToLine, Bell, BriefcaseBusiness, CalendarDays, ChartColumn, CheckCircle2, ClipboardList, FileText, FolderOpen, Home, LogOut, Plus, RefreshCw, Search, Settings, ShieldAlert, Users, X } from "lucide-react";
import { api, createRecord, exportUrl, generatePeriod, getSession, getWorkspace, login, logout, patchDocument, patchTask, setup } from "./api";
import { sampleWorkspace } from "./demo";
import { Avatar, Button, Dialog, Empty, Heading, Panel, Register, SectionMotion, StatusBadge, type Column } from "./components";
import type { Client, DocumentStatus, Enrollment, Member, Requirement, Session, Task, TaskStatus, Template, View, WorkFilter, Workspace } from "./types";

const navItems:{id:View;label:string;icon:typeof Home}[]=[
 {id:"desk",label:"Desk",icon:Home},{id:"work",label:"Work Register",icon:ClipboardList},{id:"clients",label:"Clients",icon:Users},
 {id:"documents",label:"Documents",icon:FolderOpen},{id:"compliance",label:"Compliance",icon:CalendarDays},
 {id:"team",label:"Team",icon:BriefcaseBusiness},{id:"reports",label:"Reports",icon:ChartColumn},
 {id:"activity",label:"Activity & Sync",icon:ActivityIcon},{id:"settings",label:"Settings",icon:Settings}
];
type ModalKind="client"|"task"|"document"|"staff"|"template"|"enrollment";
const taskStatuses:TaskStatus[]=["todo","in_progress","waiting","blocked","review","done"];
const docStatuses:DocumentStatus[]=["missing","requested","received","verified","rejected","not_applicable"];
function formatDate(input?:string|null){if(!input)return "—";const date=new Date(input.length===10?input+"T12:00:00":input);return Number.isNaN(date.getTime())?input:date.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
function monthNow(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}
function fyNow(){const y=new Date().getFullYear();const start=new Date().getMonth()<3?y-1:y;return start+"–"+String(start+1).slice(-2)}
function statusLabel(v:string){return ({todo:"Pending",in_progress:"In progress",waiting:"Waiting for client",blocked:"Blocked",review:"In review",done:"Completed",missing:"Missing",requested:"Requested",received:"Received",verified:"Verified",rejected:"Rejected",not_applicable:"Not applicable"} as Record<string,string>)[v]??v}
function Input({label,name,type="text",required=false,defaultValue,min,max}:{label:string;name:string;type?:string;required?:boolean;defaultValue?:string;min?:string;max?:string}){
 return <div className="field"><label htmlFor={"f-"+name}>{label}{required&&<span className="required"> *</span>}</label><input id={"f-"+name} name={name} type={type} required={required} defaultValue={defaultValue} min={min} max={max}/></div>;
}
function Select({label,name,items,required=true}:{label:string;name:string;items:[string,string][];required?:boolean}){
 return <div className="field"><label htmlFor={"f-"+name}>{label}</label><select id={"f-"+name} name={name} required={required}><option value="">Select…</option>{items.map(([value,text])=><option key={value+"-"+text} value={value}>{text}</option>)}</select></div>;
}
function Authentication({needsSetup,onSubmit,error,busy,onPreview}:{needsSetup:boolean;onSubmit:(values:Record<string,string>)=>Promise<void>;error:string;busy:boolean;onPreview:()=>void}){
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();await onSubmit(Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>)}
 return <div className="form-screen"><div className="auth-card">
  <div className="brand"><span className="brand-mark"><BriefcaseBusiness size={23}/></span> CHAMBER</div>
  <h1>{needsSetup?"Create your firm":"Sign in to Chamber"}</h1><p>{needsSetup?"One-time secure setup for your firm's principal.":"Manage clients, assignments and documents in one workspace."}</p>
  {error&&<div role="alert" className="alert">{error}</div>}
  <form onSubmit={submit}><div className="fields" style={{gridTemplateColumns:"1fr"}}>
   {needsSetup&&<><Input label="Firm name" name="firm" required/><Input label="Your name" name="name" required/></>}
   <Input label="Work email" name="email" type="email" required/><Input label="Password" name="password" type="password" required/>
   {needsSetup&&<Input label="One-time setup token" name="setup_token" type="password" required/>}
  </div><div className="form-actions"><Button type="submit" kind="primary" disabled={busy}>{busy?"Please wait…":needsSetup?"Create firm":"Sign in"}</Button></div></form>
  <hr className="subtle-sep"/><button type="button" className="text-button" onClick={onPreview}>Explore a read-only sample workspace</button>
  <p className="hint" style={{marginTop:12}}>Sample data is fictional. Production records require authorization.</p>
 </div></div>;
}
function RecordForm({kind,workspace,onCancel,onSave,busy,error}:{kind:ModalKind;workspace:Workspace;onCancel:()=>void;onSave:(kind:ModalKind,values:Record<string,string>)=>Promise<void>;busy:boolean;error:string}){
 const titles:Record<ModalKind,string>={client:"New client",task:"New assignment",document:"New document requirement",staff:"Add firm member",template:"New recurring service template",enrollment:"Enroll client in recurring service"};
 const clients:[string,string][]=workspace.clients.map(c=>[c.id,c.name]);
 const people:[string,string][]=workspace.staff.map(m=>[m.id,m.name]);
 const jobs:[string,string][]=workspace.tasks.map(t=>[t.id,(workspace.clients.find(c=>c.id===t.client_id)?.name??"Client")+" · "+t.title]);
 const templates:[string,string][]=workspace.templates.map(t=>[t.id,t.name+" · "+t.frequency]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();await onSave(kind,Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>)}
 let body:ReactNode=null;
 switch(kind){
  case "client":body=<><Input label="Legal / trading name" name="name" required/><Select label="Client category" name="category" items={[["Business","Business"],["Individual","Individual"],["Partnership","Partnership"],["Company","Company"],["Trust","Trust"]]}/><Input label="Email" name="email" type="email"/><Input label="Phone" name="phone"/><Input label="PAN" name="pan"/><Input label="GSTIN" name="gstin"/><div className="field full"><label>Internal notes</label><textarea name="notes" maxLength={1000}/></div></>;break;
  case "task":body=<><Select label="Client" name="client_id" items={clients}/><Input label="Work title" name="title" required/><Input label="Service (GST / TDS / Audit)" name="service" required/><Input label="Work period" name="period"/><Input label="Due date" name="due_date" type="date"/><Select label="Assignee" name="assignee_id" items={people} required={false}/><Select label="Priority" name="priority" items={[["medium","Medium"],["high","High"],["low","Low"]]}/><div className="field full"><label>Notes</label><textarea name="notes" maxLength={2000}/></div></>;break;
  case "document":body=<><Select label="Related assignment" name="task_id" items={jobs}/><Input label="Required document" name="name" required/><p className="hint">Document requirements start in Missing state until requested or received.</p></>;break;
  case "staff":body=<><Input label="Full name" name="name" required/><Input label="Work email" name="email" type="email" required/><Select label="Role" name="role" items={[["staff","Article / staff"],["manager","Manager"]]}/><Input label="Initial password (12+ characters)" name="password" type="password" required min="12"/></>;break;
  case "template":body=<><Input label="Template name" name="name" required/><Input label="Service" name="service" required/><Select label="Frequency" name="frequency" items={[["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"]]}/><Input label="Planning due day (1–28)" name="due_day" type="number" required min="1" max="28" defaultValue="15"/><p className="hint">An internal planning date—not an official filing deadline.</p></>;break;
  case "enrollment":body=<><Select label="Client" name="client_id" items={clients}/><Select label="Recurring template" name="template_id" items={templates}/><Select label="Default assignee" name="assignee_id" items={people} required={false}/></>;break;
 }
 return <Dialog title={titles[kind]} onClose={onCancel}>{error&&<div className="alert" role="alert">{error}</div>}<form onSubmit={submit}><div className="fields">{body}</div><div className="form-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" kind="primary" disabled={busy}>{busy?"Saving…":"Save record"}</Button></div></form></Dialog>;
}

export default function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [workspace,setWorkspace]=useState<Workspace|null>(null);
 const [preview,setPreview]=useState(false);
 const [view,setView]=useState<View>("desk");
 const [workFilter,setWorkFilter]=useState<WorkFilter>("all");
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState<string|null>(null);
 const [modal,setModal]=useState<ModalKind|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [toast,setToast]=useState("");
 const [loadedAt,setLoadedAt]=useState("");
 const [period,setPeriod]=useState(monthNow());
 const today=new Date().toISOString().slice(0,10);
 const principal=workspace?.user.role==="principal";
 const privileged=workspace?.user.role==="principal"||workspace?.user.role==="manager";
 const clientName=useCallback((id:string)=>workspace?.clients.find(c=>c.id===id)?.name??"Unknown client",[workspace]);
 const memberName=useCallback((id:string|null)=>workspace?.staff.find(s=>s.id===id)?.name??"Unassigned",[workspace]);
 const findTask=useCallback((id:string)=>workspace?.tasks.find(t=>t.id===id),[workspace]);
 const flash=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),3200)};
 const enterPreview=useCallback(()=>{
  setPreview(true);setWorkspace(sampleWorkspace);setSession({authenticated:true,needs_setup:false,user:{id:"p",name:"Demo Principal",role:"principal"}});setError("");setLoadedAt("Read-only sample");
  if(window.location.search!=="?preview=1")window.history.replaceState(null,"",window.location.pathname+"?preview=1");
 },[]);
 const refresh=useCallback(async()=>{const data=await getWorkspace();setWorkspace(data);setLoadedAt(new Date().toLocaleString("en-IN"))},[]);
 useEffect(()=>{
  let alive=true;
  if(new URLSearchParams(window.location.search).get("preview")==="1"){enterPreview();return}
  void getSession().then(async s=>{if(!alive)return;setSession(s);if(s.authenticated){const d=await getWorkspace();if(alive){setWorkspace(d);setLoadedAt(new Date().toLocaleString("en-IN"))}}}).catch(e=>{if(alive){setError(String(e));setSession({authenticated:false,needs_setup:false,user:null})}});
  return()=>{alive=false};
 },[enterPreview]);
 const navigate=useCallback((next:View)=>{setView(next);setSelected(null);setQuery("");setWorkFilter("all")},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(!workspace)return;
   if(e.key==="Escape"){setModal(null);setSelected(null);return}
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
   if(e.ctrlKey&&e.key.toLowerCase()==="k"){e.preventDefault();navigate("work");window.setTimeout(()=>document.getElementById("register-search")?.focus(),0);return}
   if(e.altKey&&e.key.toLowerCase()==="n"){e.preventDefault();if(!preview&&privileged)setModal("task");return}
   if(e.altKey&&e.key.toLowerCase()==="c"){e.preventDefault();if(!preview&&privileged)setModal("client");return}
   const pages:Record<string,View>={F1:"desk",F2:"clients",F3:"team",F4:"activity"};
   if(pages[e.key]){e.preventDefault();navigate(pages[e.key])}
  };
  document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);
 },[workspace,navigate,preview,privileged]);
 const mutate=async(action:()=>Promise<unknown>,message="Record saved.")=>{
  if(preview){flash("Read-only preview: changes are disabled.");return}
  setBusy(true);setError("");
  try{await action();await refresh();setModal(null);flash(message)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const handleAuth=async(values:Record<string,string>)=>{
  setBusy(true);setError("");
  try{
   if(session?.needs_setup){const token=values.setup_token;await setup({firm:values.firm,name:values.name,email:values.email,password:values.password},token);setSession({authenticated:false,needs_setup:false,user:null});flash("Firm created. Sign in to continue.")}
   else{await login(values.email,values.password);const d=await getWorkspace();setWorkspace(d);setSession({authenticated:true,needs_setup:false,user:d.user});setLoadedAt(new Date().toLocaleString("en-IN"))}
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const create=async(kind:ModalKind,values:Record<string,string>)=>{
  const path:{[K in ModalKind]:"clients"|"tasks"|"documents"|"staff"|"templates"|"enrollments"}={client:"clients",task:"tasks",document:"documents",staff:"staff",template:"templates",enrollment:"enrollments"};
  await mutate(()=>createRecord(path[kind],values));
 };
 const changeTask=(t:Task,status:TaskStatus)=>void mutate(()=>patchTask(t.id,status),"Assignment updated.");
 const changeDocument=(d:Requirement,status:DocumentStatus)=>void mutate(()=>patchDocument(d.id,status),"Document updated.");
 const download=(kind:"clients"|"tasks"|"documents")=>{if(preview){flash("Exports are disabled in sample mode.");return}window.location.assign(exportUrl(kind))};
 const open=(kind:ModalKind)=>{if(preview){flash("Read-only preview: sign in to create real records.");return}setError("");setModal(kind)};
 const taskDetails=(t:Task)=> <div className="detail-card"><div className="detail-head"><div><p className="hint">ASSIGNMENT DETAILS</p><h2>{t.title}</h2><p className="muted small">{clientName(t.client_id)} · {t.service} · {t.period??"No period"}</p></div><button aria-label="Close" className="close-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>
  <div className="detail-kv"><div><label>Assignee</label><span>{memberName(t.assignee_id)}</span></div><div><label>Due date</label><span>{formatDate(t.due_date)}</span></div><div><label>Reviewer</label><span>{memberName(t.reviewer_id)}</span></div><div><label>Priority</label><StatusBadge status={t.priority}/></div></div>
  <div className="field" style={{marginTop:20}}><label htmlFor="task-status">Update status</label><select id="task-status" value={t.status} disabled={busy||preview||(!privileged&&t.status==="done")} onChange={e=>changeTask(t,e.target.value as TaskStatus)}>{taskStatuses.filter(st=>privileged||st!=="done").map(st=><option key={st} value={st}>{statusLabel(st)}</option>)}</select></div>
  <div className="detail-tabs"><span>Required documents</span></div>{workspace?.documents.filter(d=>d.task_id===t.id).map(d=><div className="detail-mini" key={d.id}><strong>{d.name}</strong> <StatusBadge status={d.status}/></div>)}
  {workspace?.documents.filter(d=>d.task_id===t.id).length===0&&<p className="muted small">No document requirements.</p>}
  <div style={{marginTop:15}}><Button onClick={()=>open("document")}><Plus size={15}/> Add requirement</Button></div>
 </div>;
 const filteredTasks=useMemo(()=>!workspace?[]:workspace.tasks.filter(t=>{
  const text=[t.title,t.service,t.period,clientName(t.client_id),memberName(t.assignee_id)].join(" ").toLowerCase();
  if(query&&!text.includes(query.toLowerCase()))return false;
  if(workFilter==="mine"&&t.assignee_id!==workspace.user.id)return false;
  if(workFilter==="overdue")return Boolean(t.due_date&&t.due_date<today&&t.status!=="done");
  return workFilter==="all"||workFilter==="mine"||workFilter==="overdue"||t.status===workFilter;
 }),[workspace,query,workFilter,clientName,memberName,today]);
 const taskCols:Column<Task>[]=[
  {key:"client",title:"Client / Work",render:t=><><button className="cell-link" onClick={()=>{setView("work");setSelected(t.id)}}>{clientName(t.client_id)}</button><div className="secondary-cell">{t.title}</div></>},
  {key:"service",title:"Service / Period",render:t=><>{t.service}<div className="secondary-cell">{t.period??"—"}</div></>},
  {key:"assignee",title:"Assignee",render:t=><span style={{display:"flex",alignItems:"center",gap:8}}><Avatar name={memberName(t.assignee_id)}/>{memberName(t.assignee_id)}</span>},
  {key:"due",title:"Due date",render:t=><span className="nowrap">{formatDate(t.due_date)}</span>},
  {key:"status",title:"Status",render:t=><StatusBadge status={t.status}/>},
  {key:"action",title:"",render:t=><Button kind="sm" onClick={()=>{setView("work");setSelected(t.id)}}>Open</Button>}
 ];
 const clientCols:Column<Client>[]=[
  {key:"name",title:"Client",render:c=><><button className="cell-link" onClick={()=>setSelected(c.id)}>{c.name}</button><div className="secondary-cell">{c.category}</div></>},
  {key:"email",title:"Email",render:c=>c.email??"—"},
  {key:"phone",title:"Phone",render:c=>c.phone??"—"},
  {key:"work",title:"Active assignments",render:c=>workspace?.tasks.filter(t=>t.client_id===c.id&&t.status!=="done").length??0},
  {key:"created",title:"Added",render:c=>formatDate(c.created_at)}
 ];
 const docCols:Column<Requirement>[]=[
  {key:"client",title:"Client",render:d=><button className="cell-link" onClick={()=>setSelected(d.id)}>{clientName(d.client_id)}</button>},
  {key:"task",title:"Assignment",render:d=>findTask(d.task_id)?.title??"—"},
  {key:"name",title:"Document",render:d=><button className="cell-link" onClick={()=>setSelected(d.id)}>{d.name}</button>},
  {key:"status",title:"Status",render:d=><StatusBadge status={d.status}/>},
  {key:"requested",title:"Requested",render:d=>formatDate(d.requested_at)},
  {key:"updated",title:"Updated",render:d=>formatDate(d.updated_at)}
 ];
 function registerSearch(placeholder:string){return <input id="register-search" className="search" aria-label={placeholder} value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder}/>}
 function previewBanner(){return preview?<div className="notice" style={{marginBottom:18}}>SAMPLE PREVIEW · Fictional records. All mutations, exports and messages are disabled. <button className="text-button" onClick={()=>window.location.assign("/")}>Exit preview</button></div>:null}
 function showDesk(){
  const tasks=workspace!.tasks;const cards:[string,number,string,WorkFilter][]=[
   ["Pending",tasks.filter(t=>t.status==="todo").length,"blue","todo"],["Waiting for Client",tasks.filter(t=>t.status==="waiting").length,"amber","waiting"],["In Review",tasks.filter(t=>t.status==="review").length,"violet","review"],["Overdue",tasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=="done").length,"rose","overdue"],["Completed",tasks.filter(t=>t.status==="done").length,"green","done"]
  ];
  const upcoming=tasks.filter(t=>t.status!=="done").slice().sort((a,b)=>(a.due_date??"9999").localeCompare(b.due_date??"9999")).slice(0,7);
  return <>{previewBanner()}<Heading title="Desk" subtitle="Firm overview, today's work and upcoming compliance" actions={<Button kind="primary" onClick={()=>open("task")}><Plus size={16}/> New assignment</Button>}/>
   <div className="cards">{cards.map(([name,num,tone,filter])=><button className={"kpi "+tone} key={name} onClick={()=>{navigate("work");setWorkFilter(filter)}}><div><label>{name}</label><div className="number">{num}</div></div><ClipboardList className="kpi-icon"/></button>)}</div>
   <div className="desk-grid">
    <section><Panel title="Today's work" actions={<button className="text-button" onClick={()=>navigate("work")}>View all work</button>}><p className="muted small">Open assignments and approaching deadlines</p></Panel><Register columns={taskCols.filter(c=>c.key!=="action")} rows={upcoming} empty="No open work"/></section>
    <Panel title="Team workload" actions={<button className="text-button" onClick={()=>navigate("team")}>View team</button>}>{workspace!.staff.map(m=>{const count=tasks.filter(t=>t.assignee_id===m.id&&t.status!=="done").length;return <div className="stats-line" key={m.id}><Avatar name={m.name}/><div className="grow"><strong className="small">{m.name}</strong><div className="hint">{m.role}</div></div><div className="progress"><i style={{width:Math.min(100,count/12*100)+"%"}}/></div><span className="tiny">{count} work</span></div>})}</Panel>
    <Panel title="Upcoming deadlines" actions={<button className="text-button" onClick={()=>navigate("compliance")}>View calendar</button>}>{upcoming.filter(t=>t.due_date).map(t=><div key={t.id} className="stats-line"><div className="grow"><strong className="small">{t.service}</strong><div className="hint">{clientName(t.client_id)} · {t.title}</div></div><span className="tiny nowrap">{formatDate(t.due_date)}</span></div>)}{!upcoming.length&&<Empty title="No upcoming work"/>}</Panel>
    <Panel title="Review queue">{tasks.filter(t=>t.status==="review").map(t=><div className="stats-line" key={t.id}><div className="grow"><strong className="small">{clientName(t.client_id)}</strong><div className="hint">{t.title}</div></div><Button kind="sm" onClick={()=>{navigate("work");setSelected(t.id)}}>Review</Button></div>)}{!tasks.some(t=>t.status==="review")&&<Empty title="Nothing awaiting review"/>}</Panel>
   </div>
  </>;
 }
 function showWork(){
  const options:[WorkFilter,string][]=[["all","All"],["mine","Mine"],["todo","Pending"],["waiting","Waiting"],["review","In review"],["overdue","Overdue"],["done","Completed"]];
  const detail=workspace!.tasks.find(t=>t.id===selected);
  return <>{previewBanner()}<Heading title="Work Register" subtitle="Assignments, ownership, statuses and dates" actions={<>{privileged&&<Button kind="primary" onClick={()=>open("task")}><Plus size={16}/> New work</Button>}<Button onClick={()=>download("tasks")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
   <div className="segmented">{options.map(([value,label])=><button key={value} className={"chip "+(workFilter===value?"active":"")} onClick={()=>setWorkFilter(value)}>{label}</button>)}</div>
   <div className="toolbar">{registerSearch("Search clients, work, services, assignees…")}<Button onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</Button></div>
   <Register columns={taskCols} rows={filteredTasks} empty="No matching assignments"/>
   {detail&&<div style={{marginTop:18}}>{taskDetails(detail)}</div>}
  </>;
 }
 function showClients(){
  const rows=workspace!.clients.filter(c=>[c.name,c.email,c.category,c.pan,c.gstin].join(" ").toLowerCase().includes(query.toLowerCase()));
  const active=workspace!.clients.find(c=>c.id===selected);
  return <>{previewBanner()}<Heading title="Client Master" subtitle="Central client records and service history" actions={<>{privileged&&<Button kind="primary" onClick={()=>open("client")}><Plus size={16}/> New client</Button>}<Button onClick={()=>download("clients")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
   <div className="toolbar">{registerSearch("Search client, email, PAN or GSTIN…")}</div><div className={active?"split-grid":""}><Register columns={clientCols} rows={rows} empty="No clients yet"/>{active&&<div className="detail-card"><div className="detail-head"><div><h2>{active.name}</h2><StatusBadge status={active.category}/></div><button className="close-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>
    <div className="detail-kv"><div><label>Email</label><span>{active.email??"—"}</span></div><div><label>Phone</label><span>{active.phone??"—"}</span></div><div><label>PAN</label><span>{active.pan?"••••"+active.pan.slice(-4):"—"}</span></div><div><label>GSTIN</label><span>{active.gstin?"••••"+active.gstin.slice(-4):"—"}</span></div></div>
    <div className="detail-tabs"><span>Assignments</span></div>{workspace!.tasks.filter(t=>t.client_id===active.id).map(t=><div className="detail-mini" key={t.id}><strong>{t.title}</strong><p>{t.service} · {statusLabel(t.status)} · {formatDate(t.due_date)}</p></div>)}</div>}</div>
  </>;
 }
 function showDocuments(){
  const rows=workspace!.documents.filter(d=>[d.name,clientName(d.client_id),findTask(d.task_id)?.title].join(" ").toLowerCase().includes(query.toLowerCase()));
  const active=workspace!.documents.find(d=>d.id===selected);
  const draft=active?"Dear Sir/Madam,\n\nPlease provide "+active.name+" required for "+(findTask(active.task_id)?.title??"the assignment")+" ("+(findTask(active.task_id)?.period??"current period")+").\n\nRegards,\n"+workspace!.firm.name:"";
  const client=active?workspace!.clients.find(c=>c.id===active.client_id):null;
  return <>{previewBanner()}<Heading title="Document Register" subtitle="Missing, requested and received client information" actions={<><Button kind="primary" onClick={()=>open("document")}><Plus size={16}/> Add requirement</Button><Button onClick={()=>download("documents")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
   <div className="segmented"><span className="chip">All <b>{workspace!.documents.length}</b></span>{(["missing","requested","received","verified"] as DocumentStatus[]).map(s=><span className="chip" key={s}>{statusLabel(s)} <b>{workspace!.documents.filter(d=>d.status===s).length}</b></span>)}</div>
   <div className="toolbar">{registerSearch("Search client, assignment or document…")}</div>
   <div className={active?"split-grid":""}><Register columns={docCols} rows={rows} empty="No document requirements"/>{active&&<div className="detail-card">
    <div className="detail-head"><div><p className="hint">DOCUMENT REQUIREMENT</p><h2>{active.name}</h2><p className="muted small">{clientName(active.client_id)}</p></div><button className="close-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>
    <div className="detail-kv"><div><label>Assignment</label><span>{findTask(active.task_id)?.title??"—"}</span></div><div><label>Requested</label><span>{formatDate(active.requested_at)}</span></div></div>
    <div className="field" style={{marginTop:18}}><label htmlFor="document-status">Update document status</label><select id="document-status" value={active.status} disabled={busy||preview||(!privileged&&active.status==="verified")} onChange={e=>changeDocument(active,e.target.value as DocumentStatus)}>{docStatuses.filter(s=>privileged||(s!=="verified"&&s!=="not_applicable")).map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></div>
    <hr className="subtle-sep"/><h3 className="section-heading">Client request draft</h3><div className="notice" style={{whiteSpace:"pre-wrap"}}>{draft}</div><div className="actions" style={{marginTop:12}}><Button onClick={()=>void navigator.clipboard.writeText(draft).then(()=>flash("Draft copied; not sent."))}>Copy message</Button><Button onClick={()=>{if(preview)return flash("Preview: messaging disabled");if(!client?.email)return flash("Client email is missing.");window.location.assign("mailto:"+encodeURIComponent(client.email)+"?subject="+encodeURIComponent("Document request: "+active.name)+"&body="+encodeURIComponent(draft))}}>Open email draft</Button></div><p className="hint">This does not send a message automatically.</p>
   </div>}</div>
  </>;
 }
 function showCompliance(){
  const dates=workspace!.tasks.filter(t=>t.due_date&&t.status!=="done").slice().sort((a,b)=>(a.due_date??"").localeCompare(b.due_date??""));
  const columns:Column<Task>[]=[taskCols[0],taskCols[1],taskCols[3],taskCols[4]];
  return <>{previewBanner()}<Heading title="Compliance Calendar" subtitle="Recurring work templates and firm-planned due dates" actions={<>{privileged&&<><Button kind="primary" onClick={()=>open("template")}><Plus size={16}/> New template</Button><Button onClick={()=>open("enrollment")}>Enroll client</Button></>}</>}/>
   <div className="notice" style={{marginBottom:17}}>Due days here are internal planning dates, not legally verified filing deadlines. Confirm statutory dates against the official rules.</div>
   <div className="split-grid"><Panel title="Recurring service templates">{workspace!.templates.length===0?<Empty title="No recurring templates"/>:workspace!.templates.map(t=><div className="stats-line" key={t.id}><div className="grow"><strong className="small">{t.name}</strong><p className="hint">{t.service} · {t.frequency} · planning day {t.due_day}</p></div><span className="badge-number">{workspace!.enrollments.filter((e:Enrollment)=>e.template_id===t.id&&e.active).length} clients</span></div>)}
    {privileged&&<div className="toolbar" style={{marginTop:15}}><label htmlFor="period">Generate work for period</label><input id="period" type="month" className="control" value={period} onChange={e=>setPeriod(e.target.value)}/><Button disabled={busy||preview} onClick={()=>void mutate(async()=>{const r=await generatePeriod(period);flash(r.created+" assignments created; "+r.already+" already existed.")},"Work generated.")}>Generate assignments</Button></div>}</Panel>
    <section><Panel title="Upcoming deadlines"><p className="muted small">Firm-set due dates and reporting periods</p></Panel><Register columns={columns} rows={dates} empty="No scheduled work"/></section>
   </div>
  </>;
 }
 function showTeam(){
  const columns:Column<Member>[]=[
   {key:"name",title:"Member",render:m=><div style={{display:"flex",alignItems:"center",gap:9}}><Avatar name={m.name}/><div><strong>{m.name}</strong><div className="secondary-cell">{m.email}</div></div></div>},
   {key:"role",title:"Role",render:m=><span className={"tag "+m.role}>{m.role}</span>},
   {key:"active",title:"Active work",render:m=>workspace!.tasks.filter(t=>t.assignee_id===m.id&&t.status!=="done").length},
   {key:"done",title:"Completed",render:m=>workspace!.tasks.filter(t=>t.assignee_id===m.id&&t.status==="done").length},
   {key:"availability",title:"Assignment status",render:m=><StatusBadge status={workspace!.tasks.some(t=>t.assignee_id===m.id&&t.status!=="done")?"in_progress":"done"}/>}
  ];
  return <>{previewBanner()}<Heading title="Team Register" subtitle="Staff work allocation and assignment visibility" actions={principal&&<Button kind="primary" onClick={()=>open("staff")}><Plus size={16}/> Add staff</Button>}/>
   <div className="notice" style={{marginBottom:18}}>Availability reflects assignments inside Chamber; it does not measure someone's actual working time.</div><Register columns={columns} rows={workspace!.staff}/>
  </>;
 }
 function showReports(){
  const cards=[["Total assignments",workspace!.tasks.length],["Completed",workspace!.tasks.filter(t=>t.status==="done").length],["Waiting for client",workspace!.tasks.filter(t=>t.status==="waiting").length],["Missing documents",workspace!.documents.filter(d=>d.status==="missing").length]];
  return <>{previewBanner()}<Heading title="Reports" subtitle="Firm operations, workload and bottlenecks" actions={<Button onClick={()=>download("tasks")}><ArrowDownToLine size={16}/> Export work</Button>}/><div className="cards" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))"}}>{cards.map(([name,value])=><div key={name} className="kpi"><div><label>{name}</label><div className="number">{value}</div></div></div>)}</div>
   <Panel title="Work by staff">{workspace!.staff.map(m=><div className="stats-line" key={m.id}><div className="grow"><strong>{m.name}</strong></div><span className="small">{workspace!.tasks.filter(t=>t.assignee_id===m.id&&t.status!=="done").length} open · {workspace!.tasks.filter(t=>t.assignee_id===m.id&&t.status==="done").length} completed</span></div>)}</Panel>
  </>;
 }
 function showActivity(){return <>{previewBanner()}<Heading title="Activity & Sync" subtitle="Timestamped changes and operational status" actions={<Button onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</Button>}/><div className="split-grid">
  <Panel title="Activity trail"><div className="timeline">{workspace!.activity.length===0?<Empty title="No recorded activity"/>:workspace!.activity.map(e=><div key={e.id} className="event"><strong>{e.actor_name??"Automation"} · {e.event} {e.entity_type}</strong><p>{e.entity_type} · {e.entity_id.slice(0,8)}</p><time>{formatDate(e.at)}</time></div>)}</div></Panel>
  <Panel title="System status"><div className="stats-line"><span className="green-dot"/><strong>{preview?"Sample data · read only":"Connected to Chamber API"}</strong></div><div className="stats-line"><div className="grow"><strong>Last data load</strong><div className="hint">{loadedAt}</div></div></div><div className="notice">WhatsApp Business and direct mail delivery integrations are not yet configured.</div></Panel>
  </div></>}
 function showSettings(){return <>{previewBanner()}<Heading title="Settings" subtitle="Firm account and integration settings"/><Panel title="Firm account"><div className="detail-kv"><div><label>Firm</label><span>{workspace!.firm.name}</span></div><div><label>User</label><span>{workspace!.user.name}</span></div><div><label>Role</label><span>{workspace!.user.role}</span></div><div><label>Email</label><span>{workspace!.user.email}</span></div></div><div style={{marginTop:20}}><Button onClick={()=>{if(preview){window.location.assign("/");return}void logout().then(()=>{setWorkspace(null);setSession({authenticated:false,needs_setup:false,user:null})}).catch(e=>setError(String(e)))}}><LogOut size={15}/> {preview?"Exit preview":"Sign out"}</Button></div></Panel></>}
 let page:ReactNode=null;
 if(workspace){switch(view){case "desk":page=showDesk();break;case "work":page=showWork();break;case "clients":page=showClients();break;case "documents":page=showDocuments();break;case "compliance":page=showCompliance();break;case "team":page=showTeam();break;case "reports":page=showReports();break;case "activity":page=showActivity();break;case "settings":page=showSettings();break;}}
 if(!session)return <main className="initial-loading">Loading Chamber…</main>;
 if(!session.authenticated||!workspace)return <Authentication needsSetup={session.needs_setup} onSubmit={handleAuth} error={error} busy={busy} onPreview={enterPreview}/>;
 return <div className="app-layout">
  <header className="topbar"><div className="brand"><span className="brand-mark"><BriefcaseBusiness size={22}/></span>CHAMBER</div><div className="breadcrumb">/ <strong>{navItems.find(n=>n.id===view)?.label}</strong></div>{preview&&<span className="tag review">SAMPLE PREVIEW</span>}<span className="fy">FY {fyNow()}</span>
   <button className="header-search" onClick={()=>{navigate("work");window.setTimeout(()=>document.getElementById("register-search")?.focus(),0)}}><Search size={17}/> Search clients, work, documents… <kbd>Ctrl K</kbd></button><Bell size={18} aria-label="Notifications (coming soon)"/><div className="top-user"><Avatar name={workspace.user.name}/><div><div className="name">{workspace.user.name}</div><small>{workspace.user.role}</small></div></div>
  </header>
  <aside className="sidebar" aria-label="Main navigation">{navItems.map(({id,label,icon:Icon})=><button key={id} className={"side-link "+(view===id?"active":"")} onClick={()=>navigate(id)} aria-current={view===id?"page":undefined}><Icon size={19}/><span>{label}</span></button>)}<div className="sidebar-spacer"/><div className="firm-foot"><BriefcaseBusiness size={20}/><div><strong>{workspace.firm.name}</strong><br/><small>Firm workspace</small></div></div></aside>
  <main className="main-area"><SectionMotion identity={view} key={view}>{page}</SectionMotion>{error&&workspace&&<div className="alert" style={{marginTop:20}} role="alert">{error}</div>}</main>
  <footer className="statusbar"><ShieldAlert size={14}/> F1–F4: Navigate <span>·</span> Alt+N: New work <span>·</span> Ctrl+K: Search <span className="push"><span className="green-dot"/>{preview?"Sample mode · read only":"Connected"}</span></footer>
  {modal&&<RecordForm kind={modal} workspace={workspace} onClose={()=>setModal(null)} onCancel={()=>setModal(null)} onSave={create} busy={busy} error={error}/>}
  {toast&&<div className="toast" role="status">{toast}</div>}
 </div>;
}
