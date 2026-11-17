import { AlertCircle, ArrowRight, CalendarClock, CheckCheck, ClipboardCheck, FileWarning, FolderSearch, Plus, UserRoundCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { Requirement, Task, View, WorkFilter, Workspace } from "./types";
import { StatusBadge } from "./components";

type Props = {
  workspace: Workspace;
  today: string;
  onNavigate: (view: View, filter?: WorkFilter) => void;
  onTask: (id: string) => void;
  onDocument: (id: string) => void;
  onNew: () => void;
  preview: boolean;
};

const formatDay = (value: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
function RelativeDue({ due, today }: { due: string | null; today: string }) {
  if (!due) return <span className="due-label">No date</span>;
  const days = Math.round((Date.parse(due + "T12:00:00") - Date.parse(today + "T12:00:00")) / 86400000);
  const label = days < 0 ? Math.abs(days) + "d overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : formatDay(due);
  return <span className={"due-label" + (days < 0 ? " late" : days === 0 ? " due-today" : "")}>{label}</span>;
}
function Zone({ title, kicker, action, children, className = "" }: { title: string; kicker: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={"workbench-zone " + className}>
    <div className="workbench-zone-head"><div><span className="zone-eyebrow">{kicker}</span><h2>{title}</h2></div>{action}</div>
    {children}
  </section>;
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="workbench-empty"><CheckCheck size={19}/><strong>{title}</strong><span>{description}</span></div>;
}
export default function DeskWorkspace({ workspace, today, onNavigate, onTask, onDocument, onNew, preview }: Props) {
  const userIsStaff = workspace.user.role === "staff";
  const tasks = workspace.tasks;
  const openTasks = tasks.filter(t => t.status !== "done");
  const late = openTasks.filter(t => t.due_date && t.due_date < today);
  const review = openTasks.filter(t => t.status === "review");
  const blocked = openTasks.filter(t => t.status === "blocked" || t.status === "waiting");
  const docs = workspace.documents;
  const missingDocs = docs.filter(d => d.status === "missing" || d.status === "requested" || d.status === "rejected");
  const risk = (t: Task) => t.due_date && t.due_date < today ? 0 : t.status === "blocked" ? 1 : t.status === "review" ? 2 : t.status === "waiting" ? 3 : t.due_date === today ? 4 : 5;
  const focus = openTasks.slice().sort((a,b) => risk(a) - risk(b) || (a.due_date || "9999").localeCompare(b.due_date || "9999")).slice(0,7);
  const deadlines = openTasks.filter(t => t.due_date).slice().sort((a,b) => (a.due_date || "").localeCompare(b.due_date || "")).slice(0,5);
  const clientName = (id: string) => workspace.clients.find(c => c.id === id)?.name || "Unknown client";
  const owner = (id: string|null) => workspace.staff.find(m => m.id === id)?.name || "Unassigned";
  const taskName = (id: string) => workspace.tasks.find(t => t.id === id)?.title || "Assignment";
  const staff = workspace.staff.map(m => ({ ...m, count: openTasks.filter(t => t.assignee_id === m.id).length }))
    .sort((a,b) => b.count - a.count);
  const maximum = Math.max(1, ...staff.map(s=>s.count));
  const statCells: {label:string;value:number;hint:string;icon:ReactNode;kind:string;filter:WorkFilter}[] = [
    {label:"Open assignments",value:openTasks.length,hint:"Across active periods",icon:<ClipboardCheck size={20}/>,kind:"neutral",filter:"all"},
    {label:"Past due",value:late.length,hint:"Need attention",icon:<AlertCircle size={20}/>,kind:"danger",filter:"overdue"},
    {label:"Waiting on clients",value:blocked.filter(t=>t.status==="waiting").length,hint:"Follow-up needed",icon:<FileWarning size={20}/>,kind:"amber",filter:"waiting"},
    {label:"Ready for review",value:review.length,hint:"Pending approval",icon:<UserRoundCheck size={20}/>,kind:"indigo",filter:"review"},
  ];
  function docRow(d:Requirement) {
    return <button className="followup-line" key={d.id} onClick={()=>onDocument(d.id)}>
      <span className={"followup-symbol " + d.status}><FolderSearch size={16}/></span>
      <span className="followup-copy"><strong>{clientName(d.client_id)}</strong><small>{d.name} · {taskName(d.task_id)}</small></span>
      <StatusBadge status={d.status}/>
    </button>;
  }
  return <div className="workbench">
    <div className="workbench-heading">
      <div className="workbench-heading-left"><div className="workbench-eyebrow">FIRM OPERATIONS <span className="eyebrow-dot"/> {new Date(today + "T12:00:00").toLocaleDateString("en-IN", {weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        <h1>{userIsStaff ? "My workspace" : "Firm desk"}<span className="heading-period"> / Overview</span></h1>
        <p>One place to see what needs attention, who owns it and what happens next.</p>
      </div>
      <div className="workbench-heading-actions">
        <button className="btn" onClick={()=>onNavigate("work")}>Open register <ArrowRight size={15}/></button>
        {!userIsStaff && <button className="btn primary" onClick={onNew} disabled={preview}><Plus size={16}/> New assignment</button>}
      </div>
    </div>
    <div className="metric-strip" aria-label="Firm work overview">
      {statCells.map(item=><button className="metric-cell" key={item.label} onClick={()=>onNavigate("work",item.filter)}>
        <span className={"metric-icon " + item.kind}>{item.icon}</span>
        <span className="metric-body"><span className="metric-label">{item.label}</span><span className="metric-number">{item.value.toLocaleString("en-IN")}</span><span className="metric-hint">{item.hint}</span></span>
        <ArrowRight size={14} className="metric-arrow"/>
      </button>)}
    </div>
    <div className="workbench-layout">
      <div className="workbench-primary">
        <Zone title="Priority queue" kicker="01 / WORK NEEDING ATTENTION" action={<button className="inline-link" onClick={()=>onNavigate("work")}>All assignments <ArrowRight size={14}/></button>}>
          {focus.length === 0
            ? <EmptyState title="You're all caught up" description="Open assignments will appear here once created."/>
            : <div className="priority-table-wrap"><table className="priority-table">
              <thead><tr><th>CLIENT & ASSIGNMENT</th><th>OWNER</th><th>DUE</th><th>STATE</th><th aria-label="Open record"/></tr></thead>
              <tbody>{focus.map(t=><tr key={t.id}>
                <td><button className="priority-record" onClick={()=>onTask(t.id)}><strong>{clientName(t.client_id)}</strong><span>{t.title} <span className="muted-separator">·</span> {t.service}</span></button></td>
                <td><span className="owner-cell">{owner(t.assignee_id)}</span></td>
                <td><RelativeDue due={t.due_date} today={today}/></td>
                <td><StatusBadge status={t.status}/></td>
                <td><button className="arrow-open" aria-label={"Open " + t.title} onClick={()=>onTask(t.id)}><ArrowRight size={16}/></button></td>
              </tr>)}</tbody>
            </table></div>}
        </Zone>
        <div className="workbench-double">
          <Zone title="Upcoming work" kicker="02 / PLANNING" action={<button className="inline-link" onClick={()=>onNavigate("compliance")}>Compliance <ArrowRight size={14}/></button>}>
            {deadlines.length===0?<EmptyState title="No dates assigned" description="Work with due dates will appear here."/>:<div className="deadline-list">
              {deadlines.map(t=><button className="deadline-line" key={t.id} onClick={()=>onTask(t.id)}>
                <span className="deadline-calendar"><CalendarClock size={16}/><strong>{formatDay(t.due_date)}</strong></span>
                <span className="deadline-copy"><strong>{t.service}</strong><small>{clientName(t.client_id)} · {t.title}</small></span>
                <ArrowRight size={15}/>
              </button>)}
            </div>}
          </Zone>
          <Zone title="Review handoff" kicker="03 / QUALITY CONTROL" action={<button className="inline-link" onClick={()=>onNavigate("work","review")}>Review queue <ArrowRight size={14}/></button>}>
            {review.length===0?<EmptyState title="Nothing in review" description="Submitted work will appear here for the reviewer."/>:<div className="review-list">
              {review.slice(0,5).map(t=><button className="review-line" key={t.id} onClick={()=>onTask(t.id)}><span className="review-mark"><UserRoundCheck size={16}/></span><span><strong>{clientName(t.client_id)}</strong><small>{t.title} · {owner(t.assignee_id)}</small></span><ArrowRight size={15}/></button>)}
            </div>}
          </Zone>
        </div>
      </div>
      <aside className="workbench-secondary">
        <Zone title="Client follow-ups" kicker="04 / DOCUMENTS" action={<button className="inline-link" onClick={()=>onNavigate("documents")}>Open register <ArrowRight size={14}/></button>} className="followup-zone">
          <div className="followup-summary"><span className="followup-number">{missingDocs.length}</span><span>required items still pending<br/><small>Missing, requested or rejected</small></span></div>
          {missingDocs.length===0?<EmptyState title="No missing items" description="Your requested documents are accounted for."/>:<div className="followup-list">{missingDocs.slice(0,5).map(docRow)}</div>}
          {missingDocs.length>5&&<button className="full-width-link" onClick={()=>onNavigate("documents")}>View all {missingDocs.length} pending items <ArrowRight size={14}/></button>}
        </Zone>
        <Zone title="Assignment distribution" kicker="05 / TEAM CAPACITY" action={<button className="inline-link" onClick={()=>onNavigate("team")}>Team <ArrowRight size={14}/></button>}>
          {staff.length===0?<EmptyState title="No staff yet" description="Add team members to see their work."/>:<div className="capacity-list">
            {staff.slice(0,6).map(member=><div className="capacity-line" key={member.id}>
              <span className="capacity-avatar">{member.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase()}</span>
              <span className="capacity-info"><span className="capacity-name"><strong>{member.name}</strong><span>{member.count}</span></span><span className="capacity-bar"><i style={{width:member.count/maximum*100+"%"}}/></span></span>
            </div>)}
            <p className="capacity-footnote"><UsersRound size={13}/> Counts reflect open assignments, not hours worked.</p>
          </div>}
        </Zone>
      </aside>
    </div>
    <div className="desk-disclaimer">Chamber displays firm-entered planning dates. Verify statutory deadlines independently against official notifications.</div>
  </div>;
}
