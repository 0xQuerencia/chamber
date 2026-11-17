import { useEffect, useMemo, useState } from "react";
import type { Task, Workspace, View, WorkFilter } from "./types";

type Props = {
  data: Workspace;
  today: string;
  onNavigate: (view: View, filter?: WorkFilter) => void;
  onTask: (id: string) => void;
  onDocument: (id: string) => void;
};

type DeskTab = "open" | "overdue" | "waiting" | "review" | "unassigned";
const tabs: { key: DeskTab; name: string }[] = [
  { key: "open", name: "All Open" },
  { key: "overdue", name: "Overdue" },
  { key: "waiting", name: "Waiting for Client" },
  { key: "review", name: "Pending Review" },
  { key: "unassigned", name: "Unassigned" }
];

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function stage(status: string) {
  const values: Record<string,string> = {
    todo: "Not Started", in_progress: "In Progress", waiting: "Awaiting Data",
    blocked: "On Hold", review: "Under Review", done: "Completed",
    missing: "Missing", requested: "Requested", received: "Received", verified: "Verified", rejected: "Rejected"
  };
  return values[status] || status;
}
const blank = "—";

export default function ErpDesk({ data, today, onNavigate, onTask, onDocument }: Props) {
  const [tab, setTab] = useState<DeskTab>("open");
  const [search, setSearch] = useState("");
  const [focusIndex, setFocusIndex] = useState(-1);
  const client = (id: string) => data.clients.find(c => c.id === id)?.name || "Unknown";
  const assignee = (id: string | null) => data.staff.find(s => s.id === id)?.name || "Unassigned";
  const open = data.tasks.filter(t=>t.status!=="done");
  const overdue = open.filter(t=>t.due_date && t.due_date<today);
  const waiting = open.filter(t=>t.status==="waiting");
  const reviewing = open.filter(t=>t.status==="review");
  const unassigned = open.filter(t=>!t.assignee_id);
  const pendingDocs = data.documents.filter(d=>["missing","requested","rejected"].includes(d.status));
  const sorted = useMemo(()=>open.filter(t=>{
    const tabMatch = tab==="open" || (tab==="overdue" && !!t.due_date && t.due_date<today) ||
      (tab==="waiting" && t.status==="waiting") || (tab==="review" && t.status==="review") ||
      (tab==="unassigned" && !t.assignee_id);
    return tabMatch && [client(t.client_id),t.title,t.service,t.period,assignee(t.assignee_id)]
      .join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }).sort((a,b)=>(a.due_date||"9999").localeCompare(b.due_date||"9999") || client(a.client_id).localeCompare(client(b.client_id))),
    // data reference changes when records are refreshed; recompute with current firm records.
    [open, tab, search, today]);
  useEffect(()=>setFocusIndex(-1),[tab,search]);
  const gotoRow=(id:string)=>onTask(id);
  const selectTab=(key:DeskTab)=>{setTab(key);setSearch("")};
  const tabCount=(key:DeskTab)=>({open:open.length,overdue:overdue.length,waiting:waiting.length,review:reviewing.length,unassigned:unassigned.length})[key];
  const counts = [
    {key:"open" as const,label:"Open Work",value:open.length},
    {key:"overdue" as const,label:"Overdue",value:overdue.length},
    {key:"waiting" as const,label:"Awaiting Client Data",value:waiting.length},
    {key:"review" as const,label:"Pending Review",value:reviewing.length},
    {key:"unassigned" as const,label:"Unassigned",value:unassigned.length}
  ];
  function tableKeys(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key==="ArrowDown") {event.preventDefault();setFocusIndex(i=>Math.min(i+1,sorted.length-1));}
    if (event.key==="ArrowUp") {event.preventDefault();setFocusIndex(i=>Math.max(i-1,0));}
    if (event.key==="Enter" && focusIndex>=0 && sorted[focusIndex]) {event.preventDefault();gotoRow(sorted[focusIndex].id);}
  }
  return <div className="erp-gateway" aria-label="Chamber gateway">
    <header className="erp-report-heading">
      <div><div className="erp-report-overline">GATEWAY OF CHAMBER</div><h1>Work Control Centre</h1></div>
      <div className="erp-heading-meta"><span>Period: <b>{new Date(today+"T12:00:00").toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</b></span><span>As on: <b>{dateLabel(today)}</b></span></div>
    </header>
    <div className="erp-section-header">Work Status Summary</div>
    <div className="erp-summary-line" aria-label="Current firm work summary">
      {counts.map(c=><button type="button" key={c.key} className={"erp-summary-item"+(tab===c.key?" current":"")} onClick={()=>selectTab(c.key)}>
        <span className="erp-summary-label">{c.label}</span><strong className={c.key==="overdue"&&c.value?"erp-overdue-count":""}>{c.value}</strong>
      </button>)}
    </div>
    <div className="erp-section-header erp-section-actions">
      <span>Work Register <small>(Open Assignments)</small></span>
      <button type="button" onClick={()=>onNavigate("work")}>Display Full Register <span aria-hidden="true">»</span></button>
    </div>
    <div className="erp-register-controls">
      <div className="erp-register-filters" role="group" aria-label="Work register status">
        {tabs.map(t=><button key={t.key} type="button" aria-pressed={tab===t.key} className={tab===t.key?"selected":""} onClick={()=>selectTab(t.key)}>
          {t.name} <span className="erp-filter-count">{tabCount(t.key)}</span>
        </button>)}
      </div>
      <label className="erp-find-field"><span>Find</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Client / work / service" aria-label="Find work"/></label>
    </div>
    <div className="erp-register-scroll">
      <table className="erp-register-table">
        <thead><tr><th className="erp-col-num">No.</th><th>Client Name</th><th>Particulars / Service</th><th>Period</th><th>Assigned To</th><th>Due Date</th><th>Status</th></tr></thead>
        <tbody tabIndex={0} onKeyDown={tableKeys} aria-label="Work register. Use arrow keys to select a row and Enter to open.">
          {sorted.length===0?<tr><td colSpan={7} className="erp-no-entries">No assignments found for this selection.</td></tr>:sorted.slice(0,50).map((t,i)=><tr key={t.id} className={(i===focusIndex?"erp-current-row ":"")+(t.due_date&&t.due_date<today?"erp-row-overdue":"")} onClick={()=>gotoRow(t.id)}>
            <td className="erp-col-num">{String(i+1).padStart(2,"0")}</td>
            <td><button className="erp-row-link" onClick={e=>{e.stopPropagation();gotoRow(t.id)}}>{client(t.client_id)}</button></td>
            <td><span className="erp-particulars">{t.title}</span><span className="erp-subparticulars">{t.service}</span></td>
            <td>{t.period||blank}</td><td>{assignee(t.assignee_id)}</td><td className="erp-nowrap">{dateLabel(t.due_date)}</td>
            <td className="erp-nowrap"><span className={"erp-status-text is-"+t.status}>{stage(t.status)}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="erp-register-foot"><span>Records displayed: {Math.min(sorted.length,50)}{sorted.length>50?" of "+sorted.length:""}</span><span>↑ ↓ Select · Enter Open · Esc Back</span></div>
    <div className="erp-subregisters">
      <section className="erp-subregister">
        <div className="erp-section-header erp-section-actions"><span>Missing Client Information</span><button onClick={()=>onNavigate("documents")}>Document Register »</button></div>
        <table className="erp-mini-register">
          <thead><tr><th>Client</th><th>Information Required</th><th>Status</th></tr></thead>
          <tbody>{pendingDocs.length===0?<tr><td colSpan={3} className="erp-no-entries">No pending document requests.</td></tr>:pendingDocs.slice(0,7).map(d=><tr key={d.id} onClick={()=>onDocument(d.id)}>
            <td>{client(d.client_id)}</td><td>{d.name}</td><td className="erp-nowrap">{stage(d.status)}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <section className="erp-subregister">
        <div className="erp-section-header erp-section-actions"><span>Review & Work Allocation</span><button onClick={()=>onNavigate("team")}>Team Register »</button></div>
        <table className="erp-mini-register">
          <thead><tr><th>Particulars</th><th>Client</th><th>Assigned To</th></tr></thead>
          <tbody>{reviewing.length+unassigned.length===0?<tr><td colSpan={3} className="erp-no-entries">No unassigned work or reviews pending.</td></tr>:[...reviewing,...unassigned.filter(t=>t.status!=="review")].slice(0,7).map(t=><tr key={t.id} onClick={()=>onTask(t.id)}>
            <td>{t.title}</td><td>{client(t.client_id)}</td><td>{assignee(t.assignee_id)}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </div>
    <p className="erp-advisory">Dates shown are those entered by the firm for internal planning. Refer to official notifications for statutory compliance due dates.</p>
  </div>;
}
