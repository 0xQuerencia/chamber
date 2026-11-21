import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity as ActivityIcon, ArrowDownToLine, BriefcaseBusiness, CalendarDays, ChartColumn, ClipboardList, FolderOpen, Home, LogOut, Menu, Plus, RefreshCw, Search, Settings, Users, X } from "lucide-react";
import { createRecord, exportUrl, generatePeriod, getSession, getWorkspace, login, logout, patchDocument, patchTask, setup } from "./api";
import { sampleWorkspace } from "./demo";
import ErpDesk from "./ErpDesk";
import DataTracker from "./Tracker";
import ClientProfile from "./ClientProfile";
import WorkBoard from "./WorkBoard";
import ImportWizard from "./ImportWizard";
import Composer from "./Composer";
import CommandPalette, { type CommandOption } from "./CommandPalette";
import { Avatar, Button, Dialog, Empty, Heading, Panel, Register, StatusBadge, type Column } from "./components";
import type { Client, DocumentStatus, Enrollment, Member, Requirement, Session, Task, TaskStatus, View, WorkFilter, Workspace } from "./types";

const navItems:{id:View;label:string;icon:typeof Home}[]=[
 {id:"desk",label:"Desk",icon:Home},{id:"work",label:"Work Register",icon:ClipboardList},{id:"board",label:"Work Board",icon:ClipboardList},{id:"myday",label:"My Day",icon:ClipboardList},{id:"clients",label:"Clients",icon:Users},{id:"import",label:"Import Clients",icon:ArrowDownToLine},{id:"requests",label:"Bulk Requests",icon:ClipboardList},
 {id:"documents",label:"Documents",icon:FolderOpen},{id:"tracker",label:"Data Tracker",icon:FolderOpen},{id:"compliance",label:"Compliance",icon:CalendarDays},
 {id:"team",label:"Team",icon:BriefcaseBusiness},{id:"reports",label:"Reports",icon:ChartColumn},
 {id:"activity",label:"Activity & Sync",icon:ActivityIcon},{id:"settings",label:"Settings",icon:Settings}
];
type ModalKind="client"|"task"|"document"|"staff"|"template"|"enrollment"|"requirement"|"override";
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
 const titles:Record<ModalKind,string>={client:"New client",task:"New assignment",document:"New document requirement",staff:"Add firm member",template:"New recurring service template",enrollment:"Enroll client in recurring service",requirement:"New reusable document checklist item",override:"Deadline override"};
 const clients:[string,string][]=workspace.clients.map(c=>[c.id,c.name]);
 const people:[string,string][]=workspace.staff.map(m=>[m.id,m.name]);
 const jobs:[string,string][]=workspace.tasks.map(t=>[t.id,(workspace.clients.find(c=>c.id===t.client_id)?.name??"Client")+" · "+t.title]);
 const templates:[string,string][]=workspace.templates.map(t=>[t.id,t.name+" · "+t.frequency]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();await onSave(kind,Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>)}
 let body:ReactNode=null;
 switch(kind){
  case "client":body=<><Input label="Client code (optional)" name="code"/><Input label="Legal / trading name" name="name" required/><Select label="Client category" name="category" items={[["Business","Business"],["Individual","Individual"],["Partnership","Partnership"],["Company","Company"],["Trust","Trust"]]}/><Input label="Client group" name="client_group"/><Input label="Email" name="email" type="email"/><Input label="Phone" name="phone"/><Input label="PAN" name="pan"/><Input label="Primary GSTIN" name="gstin"/><Select label="Client manager" name="manager_id" items={workspace.staff.map(s=>[s.id,s.name])} required={false}/><div className="field full"><label>Internal notes</label><textarea name="notes" maxLength={1000}/></div></>;break;
  case "task":body=<><Select label="Client" name="client_id" items={clients}/><Input label="Work title" name="title" required/><Input label="Service (GST / TDS / Audit)" name="service" required/><Input label="Work period" name="period"/><Input label="Due date" name="due_date" type="date"/><Select label="Assignee" name="assignee_id" items={people} required={false}/><Select label="Priority" name="priority" items={[["medium","Medium"],["high","High"],["low","Low"]]}/><div className="field full"><label>Notes</label><textarea name="notes" maxLength={2000}/></div></>;break;
  case "document":body=<><Select label="Related assignment" name="task_id" items={jobs}/><Input label="Required document" name="name" required/><p className="hint">Document requirements start in Missing state until requested or received.</p></>;break;
  case "staff":body=<><Input label="Full name" name="name" required/><Input label="Work email" name="email" type="email" required/><Select label="Role" name="role" items={[["staff","Article / staff"],["manager","Manager"]]}/><Input label="Initial password (12+ characters)" name="password" type="password" required min="12"/></>;break;
  case "template":body=<><Input label="Template name" name="name" required/><Input label="Service" name="service" required/><Select label="Frequency" name="frequency" items={[["monthly","Monthly"],["quarterly","Quarterly"],["annual","Annual"]]}/><Input label="Planning due day (1–28)" name="due_day" type="number" required min="1" max="28" defaultValue="15"/><Input label="Ask-by lead days" name="ask_by_lead_days" type="number" min="0" max="90" defaultValue="10"/><p className="hint">Planning dates are firm-configured, not verified statutory deadlines.</p></>;break;
  case "enrollment":body=<><Select label="Client" name="client_id" items={clients}/><Select label="Recurring template" name="template_id" items={templates}/><Select label="Default assignee" name="assignee_id" items={people} required={false}/></>;break;
  case "requirement":body=<><Select label="Service template" name="template_id" items={templates}/><Input label="Required document or information" name="name" required/><Input label="Sort order" name="sort_order" type="number" min="0" defaultValue="0"/><p className="hint">This requirement is added to all open generated tasks for the template and every future task.</p></>;break;
  case "override":body=<><Select label="Service template" name="template_id" items={templates}/><Input label="Work period (YYYY-MM, YYYY-Q1, or YYYY)" name="period" required/><Input label="New due date" name="new_due_date" type="date" required/><Input label="Source / notification reference" name="source_reference" required/><p className="hint">Manual override with an auditable source. Confirm the date before saving.</p></>;break;
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
 const [commandOpen,setCommandOpen]=useState(false);
 const [mobileNavOpen,setMobileNavOpen]=useState(false);
 const [docFilter,setDocFilter]=useState<"all"|DocumentStatus>("all");
 const [workSort,setWorkSort]=useState<"due"|"client"|"recent">("due");
 const today=(()=>{const now=new Date();const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const pick=(type:string)=>parts.find(part=>part.type===type)?.value||"";return pick("year")+"-"+pick("month")+"-"+pick("day")})();
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
 const navigate=useCallback((next:View)=>{setView(next);setSelected(null);setQuery("");setWorkFilter("all");setMobileNavOpen(false)},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(!workspace)return;
   if(e.key==="Escape"){setModal(null);setSelected(null);setCommandOpen(false);setMobileNavOpen(false);return}
   if(e.ctrlKey&&e.key.toLowerCase()==="k"){e.preventDefault();if(!modal)setCommandOpen(true);return}
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
   if(e.altKey&&e.key.toLowerCase()==="n"){e.preventDefault();if(!preview&&privileged)setModal("task");return}
   if(e.altKey&&e.key.toLowerCase()==="c"){e.preventDefault();if(!preview&&privileged)setModal("client");return}
   const pages:Record<string,View>={F1:"desk",F2:"clients",F3:"team",F4:"activity",F5:"work",F6:"documents",F7:"compliance",F8:"tracker",F9:"board"};
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
  const path:{[K in ModalKind]:"clients"|"tasks"|"documents"|"staff"|"templates"|"enrollments"|"requirements"|"overrides"}={client:"clients",task:"tasks",document:"documents",staff:"staff",template:"templates",enrollment:"enrollments",requirement:"requirements",override:"overrides"};
  await mutate(()=>createRecord(path[kind],values));
 };
 const changeTask=(t:Task,status:TaskStatus)=>void mutate(()=>patchTask(t.id,status),"Assignment updated.");
 const changeDocument=(d:Requirement,status:DocumentStatus)=>void mutate(()=>patchDocument(d.id,status),"Document updated.");
 const download=(kind:"clients"|"tasks"|"documents")=>{if(preview){flash("Exports are disabled in sample mode.");return}window.location.assign(exportUrl(kind))};
 const open=(kind:ModalKind)=>{if(preview){flash("Read-only preview: sign in to create real records.");return}setError("");setModal(kind)};
 const taskDetails=(t:Task)=> <div className="detail-card"><div className="detail-head"><div><p className="hint">ASSIGNMENT DETAILS</p><h2>{t.title}</h2><p className="muted small">{clientName(t.client_id)} · {t.service} · {t.period??"No period"}</p></div><button aria-label="Close" className="close-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>
  <div className="detail-kv"><div><label>Assignee</label><span>{memberName(t.assignee_id)}</span></div><div><label>Due date</label><span>{formatDate(t.due_date)}</span></div><div><label>Ask by</label><span>{formatDate(t.ask_by_date)}</span></div><div><label>Reviewer</label><span>{memberName(t.reviewer_id)}</span></div><div><label>Priority</label><StatusBadge status={t.priority}/></div></div>
  <div className="field" style={{marginTop:20}}><label htmlFor="task-status">Update status</label><select id="task-status" value={t.status} disabled={busy||preview||(!privileged&&t.status==="done")} onChange={e=>changeTask(t,e.target.value as TaskStatus)}>{taskStatuses.filter(st=>privileged||st!=="done").map(st=><option key={st} value={st}>{statusLabel(st)}</option>)}</select></div>
  <div className="detail-tabs"><span>Required documents</span></div>{workspace?.documents.filter(d=>d.task_id===t.id).map(d=><div className="detail-mini" key={d.id}><strong>{d.name}</strong> <StatusBadge status={d.status}/></div>)}
  {workspace?.documents.filter(d=>d.task_id===t.id).length===0&&<p className="muted small">No document requirements.</p>}
  <div style={{marginTop:15}}><Button onClick={()=>open("document")}><Plus size={15}/> Add requirement</Button></div>
 </div>;
 const filteredTasks=useMemo(()=>{
   if(!workspace)return [];
   const rows=workspace.tasks.filter(t=>{
     const text=[t.title,t.service,t.period,clientName(t.client_id),memberName(t.assignee_id)].join(" ").toLowerCase();
     if(query&&!text.includes(query.toLowerCase()))return false;
     if(workFilter==="mine"&&t.assignee_id!==workspace.user.id)return false;
     if(workFilter==="overdue")return Boolean(t.due_date&&t.due_date<today&&t.status!=="done");
     return workFilter==="all"||workFilter==="mine"||t.status===workFilter;
   });
   return rows.sort((a,b)=>workSort==="client"
       ?clientName(a.client_id).localeCompare(clientName(b.client_id))
       :workSort==="recent"?(b.updated_at||"").localeCompare(a.updated_at||"")
       :(a.due_date||"9999").localeCompare(b.due_date||"9999"));
 },[workspace,query,workFilter,clientName,memberName,today,workSort]);
 const commands:CommandOption[]=useMemo(()=>{
   if(!workspace)return [];
   const nav:CommandOption[]=navItems.map(n=>({id:"nav-"+n.id,group:"Navigate",title:n.label,hint:"Open "+n.label,onSelect:()=>navigate(n.id)}));
   const tasks:CommandOption[]=workspace.tasks.map(t=>({id:"task-"+t.id,group:"Assignments",title:t.title,hint:clientName(t.client_id)+" · "+t.service+" · "+statusLabel(t.status),keywords:t.period||"",onSelect:()=>{navigate("work");setSelected(t.id)}}));
   const clients:CommandOption[]=workspace.clients.map(c=>({id:"client-"+c.id,group:"Clients",title:c.name,hint:c.category,onSelect:()=>{navigate("clients");setSelected(c.id)}}));
   const docs:CommandOption[]=workspace.documents.map(d=>({id:"document-"+d.id,group:"Documents",title:d.name,hint:clientName(d.client_id)+" · "+statusLabel(d.status),onSelect:()=>{navigate("documents");setSelected(d.id)}}));
   const actions:CommandOption[]=preview||!privileged?[]:[
     {id:"create-task",group:"Actions",title:"Create assignment",hint:"Add work for a client",onSelect:()=>{setError("");setModal("task")}},
     {id:"create-client",group:"Actions",title:"Create client",hint:"Add to Client Master",onSelect:()=>{setError("");setModal("client")}},
     {id:"create-document",group:"Actions",title:"Add document requirement",hint:"Track missing data",onSelect:()=>{setError("");setModal("document")}}
   ];
   return [...nav,...actions,...tasks,...clients,...docs];
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[workspace,preview,privileged,navigate,clientName]);
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
  return <>{previewBanner()}<ErpDesk data={workspace!} today={today}
    onNavigate={(page,filter)=>{navigate(page);if(filter)setWorkFilter(filter)}}
    onTask={id=>{navigate("work");setSelected(id)}}
    onDocument={id=>{navigate("documents");setSelected(id)}}/></>;
 }
 function showWork(){
  const options:[WorkFilter,string][]=[["all","All work"],["mine","Assigned to me"],["todo","Pending"],["waiting","Waiting"],["review","In review"],["overdue","Overdue"],["done","Completed"]];
  const detail=workspace!.tasks.find(t=>t.id===selected);
  return <>{previewBanner()}<Heading title="Work Register" subtitle="Track every client assignment, owner and reporting period" actions={<>{privileged&&<Button kind="primary" onClick={()=>open("task")}><Plus size={16}/> New work</Button>}<Button onClick={()=>download("tasks")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
   <div className="register-tools">
     <div className="segmented" role="group" aria-label="Filter assignments">{options.map(([value,label])=><button key={value} aria-pressed={workFilter===value} className={"chip "+(workFilter===value?"active":"")} onClick={()=>setWorkFilter(value)}>{label}{value==="overdue"&&<b>{workspace!.tasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=="done").length}</b>}</button>)}</div>
     <div className="toolbar">{registerSearch("Find a client, service, assignment…")}<label className="visually-hidden" htmlFor="work-sort">Sort work</label><select id="work-sort" className="control sort-control" value={workSort} onChange={e=>setWorkSort(e.target.value as "due"|"client"|"recent")}><option value="due">Due date first</option><option value="recent">Recently updated</option><option value="client">Client A–Z</option></select><Button onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</Button></div>
   </div>
   <div className={detail?"register-with-detail":""}><Register columns={taskCols} rows={filteredTasks} empty="No matching assignments"/>
   {detail&&<aside className="record-inspector" aria-label="Assignment details">{taskDetails(detail)}</aside>}</div>
  </>;
 }
 function showClients(){
   const rows=workspace!.clients.filter(c=>[c.name,c.code,c.email,c.category,c.pan,c.gstin].join(" ").toLowerCase().includes(query.toLowerCase()));
   const active=workspace!.clients.find(c=>c.id===selected);
   return <>{previewBanner()}<Heading title="Client Master" subtitle="Firm clients, registrations, services and contacts" actions={<>{privileged&&<Button kind="primary" onClick={()=>open("client")}><Plus size={16}/> New client</Button>}<Button onClick={()=>download("clients")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
    <div className="toolbar">{registerSearch("Search client, code, email, PAN or GSTIN…")}</div>
    <div className={active?"register-with-detail":""}>
     <Register columns={clientCols} rows={rows} empty="No clients yet"/>
     {active&&<ClientProfile key={active.id} client={active} workspace={workspace!} privileged={privileged} preview={preview}
      onClose={()=>setSelected(null)} onRefresh={refresh} onTracker={()=>navigate("tracker")}/>}
    </div>
   </>;
  }
 function showDocuments(){
  const rows=workspace!.documents.filter(d=>(docFilter==="all"||d.status===docFilter)&&[d.name,clientName(d.client_id),findTask(d.task_id)?.title].join(" ").toLowerCase().includes(query.toLowerCase()));
  const active=workspace!.documents.find(d=>d.id===selected);
  const draft=active?"Dear Sir/Madam,\n\nPlease provide "+active.name+" required for "+(findTask(active.task_id)?.title??"the assignment")+" ("+(findTask(active.task_id)?.period??"current period")+").\n\nRegards,\n"+workspace!.firm.name:"";
  const client=active?workspace!.clients.find(c=>c.id===active.client_id):null;
  return <>{previewBanner()}<Heading title="Document Register" subtitle="Missing, requested and received client information" actions={<><Button kind="primary" onClick={()=>open("document")}><Plus size={16}/> Add requirement</Button><Button onClick={()=>download("documents")}><ArrowDownToLine size={16}/> Export CSV</Button></>}/>
   <div className="segmented" role="group" aria-label="Document status filter"><button aria-pressed={docFilter==="all"} className={"chip "+(docFilter==="all"?"active":"")} onClick={()=>setDocFilter("all")}>All <b>{workspace!.documents.length}</b></button>{(["missing","requested","received","verified"] as DocumentStatus[]).map(st=><button aria-pressed={docFilter===st} className={"chip "+(docFilter===st?"active":"")} key={st} onClick={()=>setDocFilter(st)}>{statusLabel(st)} <b>{workspace!.documents.filter(d=>d.status===st).length}</b></button>)}</div>
   <div className="toolbar">{registerSearch("Search client, assignment or document…")}</div>
   <div className={active?"register-with-detail":""}><Register columns={docCols} rows={rows} empty="No document requirements"/>{active&&<div className="detail-card">
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
  return <>{previewBanner()}<Heading title="Compliance Calendar" subtitle="Recurring work templates and firm-planned due dates" actions={<>{privileged&&<><Button kind="primary" onClick={()=>open("template")}><Plus size={16}/> New template</Button><Button onClick={()=>open("enrollment")}>Enroll client</Button><Button onClick={()=>open("requirement")}>Add requirement</Button><Button onClick={()=>open("override")}>Override date</Button></>}</>}/>
   <div className="notice" style={{marginBottom:17}}>Due days here are internal planning dates, not legally verified filing deadlines. Confirm statutory dates against the official rules.</div>
   <div className="split-grid"><Panel title="Recurring service templates">{workspace!.templates.length===0?<Empty title="No recurring templates"/>:workspace!.templates.map(t=><div className="stats-line" key={t.id}><div className="grow"><strong className="small">{t.name}</strong><p className="hint">{t.service} · {t.frequency} · planning day {t.due_day}</p></div><span className="badge-number">{workspace!.enrollments.filter((e:Enrollment)=>e.template_id===t.id&&e.active).length} clients</span>
      <div className="muted small" style={{width:"100%"}}>Ask by {t.ask_by_lead_days??10} days early · {(workspace!.requirements??[]).filter(r=>r.template_id===t.id&&r.required).map(r=>r.name).join(", ")||"No requirements configured"}</div></div>)}
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
  const tasks=workspace!.tasks, documents=workspace!.documents;
  const summary=[
   ["Total Assignments",tasks.length],
   ["Open",tasks.filter(t=>t.status!=="done").length],
   ["Completed",tasks.filter(t=>t.status==="done").length],
   ["Waiting for Client",tasks.filter(t=>t.status==="waiting").length],
   ["Documents Missing",documents.filter(d=>d.status==="missing").length],
   ["Under Review",tasks.filter(t=>t.status==="review").length]
  ];
  const columns:Column<Member>[]=[
   {key:"name",title:"Staff Member",render:m=>m.name},
   {key:"open",title:"Open Assignments",render:m=>tasks.filter(t=>t.assignee_id===m.id&&t.status!=="done").length},
   {key:"complete",title:"Completed",render:m=>tasks.filter(t=>t.assignee_id===m.id&&t.status==="done").length},
   {key:"review",title:"Pending Review",render:m=>tasks.filter(t=>t.assignee_id===m.id&&t.status==="review").length}
  ];
  return <>{previewBanner()}<Heading title="Work Reports" subtitle="Firm summary and staff-wise work distribution" actions={<Button onClick={()=>download("tasks")}><ArrowDownToLine size={16}/> Export Work</Button>}/>
   <div className="erp-section-header">Assignment Summary</div>
   <table className="erp-report-summary"><tbody>{summary.map(([name,count])=><tr key={name}><th scope="row">{name}</th><td>{count}</td></tr>)}</tbody></table>
   <div className="erp-section-header">Staff-wise Work Distribution</div>
   <Register columns={columns} rows={workspace!.staff} empty="No staff records"/>
  </>;
 }
 function showActivity(){return <>{previewBanner()}<Heading title="Activity & Sync" subtitle="Timestamped changes and operational status" actions={<Button onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</Button>}/><div className="split-grid">
  <Panel title="Activity trail"><div className="timeline">{workspace!.activity.length===0?<Empty title="No recorded activity"/>:workspace!.activity.map(e=><div key={e.id} className="event"><strong>{e.actor_name??"Automation"} · {e.event} {e.entity_type}</strong><p>{e.entity_type} · {e.entity_id.slice(0,8)}</p><time>{formatDate(e.at)}</time></div>)}</div></Panel>
  <Panel title="System status"><div className="stats-line"><span className="green-dot"/><strong>{preview?"Sample data · read only":"Connected to Chamber API"}</strong></div><div className="stats-line"><div className="grow"><strong>Last data load</strong><div className="hint">{loadedAt}</div></div></div><div className="notice">WhatsApp Business and direct mail delivery integrations are not yet configured.</div></Panel>
  </div></>}
 function showSettings(){return <>{previewBanner()}<Heading title="Settings" subtitle="Firm account and integration settings"/><Panel title="Firm account"><div className="detail-kv"><div><label>Firm</label><span>{workspace!.firm.name}</span></div><div><label>User</label><span>{workspace!.user.name}</span></div><div><label>Role</label><span>{workspace!.user.role}</span></div><div><label>Email</label><span>{workspace!.user.email}</span></div></div><div style={{marginTop:20}}><Button onClick={()=>{if(preview){window.location.assign("/");return}void logout().then(()=>{setWorkspace(null);setSession({authenticated:false,needs_setup:false,user:null})}).catch(e=>setError(String(e)))}}><LogOut size={15}/> {preview?"Exit preview":"Sign out"}</Button></div></Panel></>}
 let page:ReactNode=null;
 if(workspace){switch(view){case "desk":page=showDesk();break;case "work":page=showWork();break;case "board":page=<WorkBoard workspace={workspace} preview={preview} mode="board" onRefresh={refresh}/>;break;case "myday":page=<WorkBoard workspace={workspace} preview={preview} mode="myday" onRefresh={refresh}/>;break;case "clients":page=showClients();break;case "import":page=<ImportWizard workspace={workspace} preview={preview} onRefresh={refresh}/>;break;case "requests":page=<Composer workspace={workspace} preview={preview} onRefresh={refresh}/>;break;case "documents":page=showDocuments();break;case "tracker":page=<DataTracker workspace={workspace} preview={preview}/>;break;case "compliance":page=showCompliance();break;case "team":page=showTeam();break;case "reports":page=showReports();break;case "activity":page=showActivity();break;case "settings":page=showSettings();break;}}
 if(!session)return <main className="initial-loading">Loading Chamber…</main>;
 if(!session.authenticated||!workspace)return <Authentication needsSetup={session.needs_setup} onSubmit={handleAuth} error={error} busy={busy} onPreview={enterPreview}/>;
 const groups:{name:string;items:View[]}[]=[
  {name:"MASTERS",items:["clients","team","import"]},
  {name:"TRANSACTIONS",items:["work","board","myday","documents","tracker","requests"]},
  {name:"REPORTS",items:["compliance","reports","activity"]},
  {name:"UTILITIES",items:["settings"]}
 ];
 const shortcutActions:{key:string;label:string;onSelect:()=>void;disabled?:boolean}[]=[
  {key:"F1",label:"Gateway / Desk",onSelect:()=>navigate("desk")},
  {key:"F2",label:"Client Master",onSelect:()=>navigate("clients")},
  {key:"F3",label:"Team Register",onSelect:()=>navigate("team")},
  {key:"F4",label:"Activity & Sync",onSelect:()=>navigate("activity")},
  {key:"F5",label:"Work Register",onSelect:()=>navigate("work")},
  {key:"F6",label:"Document Register",onSelect:()=>navigate("documents")},
  {key:"F7",label:"Compliance",onSelect:()=>navigate("compliance")},
   {key:"F8",label:"Data Tracker",onSelect:()=>navigate("tracker")},
   {key:"F9",label:"Work Board",onSelect:()=>navigate("board")},
  {key:"Alt+N",label:"New Assignment",onSelect:()=>open("task"),disabled:preview||!privileged},
  {key:"Alt+C",label:"New Client",onSelect:()=>open("client"),disabled:preview||!privileged},
  {key:"Ctrl+K",label:"Go To / Search",onSelect:()=>setCommandOpen(true)}
 ];
 const currentPage=navItems.find(n=>n.id===view)?.label||"Desk";
 return <div className={"app-layout erp-app"+(mobileNavOpen?" mobile-open":"")}>
   <a href="#erp-main" className="erp-skip-link">Skip to contents</a>
   <header className="topbar erp-toolbar">
     <span className="erp-brand"><BriefcaseBusiness size={18}/> Chamber</span>
     <span className="erp-edition">CA Practice Management</span>
     <div className="erp-toolbar-buttons">
       <button type="button" onClick={()=>setCommandOpen(true)}><span className="erp-toolbar-key">G</span> Go To</button>
       <button type="button" onClick={()=>navigate("work")}><span className="erp-toolbar-key">W</span> Work</button>
       <button type="button" onClick={()=>navigate("clients")}><span className="erp-toolbar-key">C</span> Clients</button>
       <button type="button" onClick={()=>navigate("reports")}><span className="erp-toolbar-key">R</span> Reports</button>
     </div>
     <button className="erp-mobile-toggle" type="button" aria-label="Show navigation" onClick={()=>setMobileNavOpen(v=>!v)}><Menu size={20}/></button>
     <span className="erp-toolbar-user">{workspace.user.name} <span>({workspace.user.role})</span></span>
   </header>
   <div className="erp-companybar">
     <div className="erp-company-title"><span>Company</span><strong>{workspace.firm.name}</strong></div>
     <div className="erp-company-period"><span>Financial Year</span><strong>{fyNow()}</strong></div>
     <div className="erp-company-screen"><span>Screen</span><strong>{currentPage}</strong></div>
     {preview&&<span className="erp-sample-label">SAMPLE DATA · READ ONLY</span>}
     <button className="erp-company-search" type="button" aria-label="Go to any record" onClick={()=>setCommandOpen(true)}><Search size={14}/> Go To / Search <kbd>Ctrl+K</kbd></button>
   </div>
   {mobileNavOpen&&<button className="erp-sidebar-backdrop" onClick={()=>setMobileNavOpen(false)} aria-label="Close navigation"/>}
   <aside className="sidebar erp-menu" aria-label="Chamber modules">
     <div className="erp-menu-caption">GATEWAY OF CHAMBER</div>
     <button className={"erp-menu-entry erp-menu-home"+(view==="desk"?" selected":"")} type="button" onClick={()=>navigate("desk")} aria-current={view==="desk"?"page":undefined}><Home size={15}/> Gateway / Desk</button>
     {groups.map(g=><div className="erp-menu-group" key={g.name}>
       <div className="erp-menu-group-title">{g.name}</div>
       {g.items.map(id=>{const item=navItems.find(n=>n.id===id)!;return <button key={id} type="button" className={"erp-menu-entry"+(view===id?" selected":"")} onClick={()=>navigate(id)} aria-current={view===id?"page":undefined}>{item.label}</button>})}
     </div>)}
     <div className="erp-menu-spacer"/>
     <div className="erp-menu-footer"><span>Current User</span><strong>{workspace.user.name}</strong><span>{workspace.user.role}</span></div>
   </aside>
   <main id="erp-main" className="main-area erp-content" tabIndex={-1}>
     {page}
     {error&&<div className="alert" role="alert">{error}</div>}
   </main>
   <aside className="erp-actionbar" aria-label="Function key actions">
     <div className="erp-actionbar-heading">Function Keys</div>
     {shortcutActions.map(a=><button key={a.key} type="button" disabled={a.disabled} onClick={a.onSelect}>
       <kbd>{a.key}</kbd><span>{a.label}</span>
     </button>)}
     <div className="erp-actionbar-spacer"/>
     <button type="button" onClick={()=>{setSelected(null);setModal(null);navigate("desk")}}><kbd>Esc</kbd><span>Gateway</span></button>
   </aside>
   <footer className="statusbar erp-statusbar">
     <span>{preview?"Preview Mode":"Company Data"}</span>
     <span className="erp-status-divider">│</span>
     <span>Esc: Back</span>
     <span className="erp-status-divider">│</span>
     <span>Enter: Select</span>
     <span className="erp-status-divider">│</span>
     <span>Ctrl+K: Go To</span>
     <span className="erp-status-spacer"/>
     <span>Chamber · CA Firm Operations</span>
   </footer>
   {modal&&<RecordForm kind={modal} workspace={workspace} onCancel={()=>setModal(null)} onSave={create} busy={busy} error={error}/>}
   {commandOpen&&<CommandPalette options={commands} onClose={()=>setCommandOpen(false)}/>}
   {toast&&<div className="toast" role="status">{toast}</div>}
 </div>;
}
