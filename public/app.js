const root = document.getElementById("app");
const views = [
  ["desk","Desk","home"],["work","Work Register","list"],["clients","Clients","users"],
  ["documents","Documents","folder"],["compliance","Compliance","calendar"],
  ["team","Team","briefcase"],["reports","Reports","chart"],
  ["activity","Activity & Sync","clock"],["settings","Settings","settings"]
];
const paths = {
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  list:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h10M8 12h10M8 16h10M6 8h.01M6 12h.01"/>',
  users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  chart:'<path d="M3 20h18M6 17v-5M11 17V7M16 17V4M21 17v-8"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-.7 2.2-2.2 1L4 5 2 9l2 1v4l-2 1 2 4 2.1-1.2 2.2 1L9 21h6l.7-2.2 2.2-1L20 19l2-4-2-1v-4l2-1-2-4-2.1 1.2-2.2-1L15 3z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert:'<path d="M12 3 2 21h20zM12 9v5M12 17h.01"/>',
  file:'<path d="M7 3h8l5 5v13H7zM15 3v6h5M10 13h7M10 17h7"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  logout:'<path d="M10 3H4v18h6M15 7l5 5-5 5M9 12h11"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>'
};
const S = {loading:true,session:null,data:null,view:"desk",filter:"all",q:"",selected:null,modal:null,error:"",toast:""};
function icon(name,cls=""){return '<svg class="'+esc(cls)+'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.file)+'</svg>';}
function esc(v){return String(v===null||v===undefined?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function text(v){return esc(v||"—");}
function initials(value){return String(value||"CH").trim().split(/\s+/).slice(0,2).map(v=>v[0]||"").join("").toUpperCase();}
function pretty(date){if(!date)return "—"; const d=new Date(date.length===10?date+"T12:00:00":date);return Number.isNaN(d.getTime())?esc(date):d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
function today(){return new Date().toISOString().slice(0,10);}
function labelStatus(status){
 const labels={todo:"Pending",in_progress:"In progress",waiting:"Waiting for client",blocked:"Blocked",review:"In review",done:"Completed",missing:"Missing",requested:"Requested",received:"Received",verified:"Verified",rejected:"Rejected",not_applicable:"Not applicable"};
 return labels[status]||String(status||"Unknown");
}
function tag(value){return '<span class="tag '+esc(value)+'">'+esc(labelStatus(value))+'</span>';}
function priority(value){return '<span class="tag '+esc(value)+'">'+esc(String(value||"medium").replace(/^./,c=>c.toUpperCase()))+'</span>';}
function btn(label,action,kind=""){return '<button type="button" class="btn '+esc(kind)+'" data-action="'+esc(action)+'">'+label+'</button>';}
function heading(title,subtitle,actions=""){return '<div class="page-heading"><div><h1>'+esc(title)+'</h1><p class="subtitle">'+esc(subtitle)+'</p></div><div class="actions">'+actions+'</div></div>';}
function panel(title,body,action=""){return '<section class="panel"><div class="panel-pad"><div class="panel-title"><h2>'+title+'</h2>'+action+'</div>'+body+'</div></section>';}
function table(headers,rows,emptyTitle="No records yet",emptyMessage="Create your first record to get started.") {
 if(!rows.length)return '<div class="empty">'+icon("folder")+'<strong>'+esc(emptyTitle)+'</strong><p>'+esc(emptyMessage)+'</p></div>';
 return '<div class="grid-table-wrap"><table class="data-table"><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div><div class="table-footer"><span>Showing '+rows.length+' records</span><span>Sorted by most relevant</span></div>';
}
function client(id){return S.data?.clients?.find(c=>c.id===id);}
function staff(id){return S.data?.staff?.find(u=>u.id===id);}
function task(id){return S.data?.tasks?.find(t=>t.id===id);}
function nameOf(id){return staff(id)?.name||"Unassigned";}
function clientOf(id){return client(id)?.name||"Unknown client";}
function permitted(){return ["principal","manager"].includes(S.data?.user?.role);}
function taskVisible(t){
 const query=S.q.trim().toLowerCase(), search=[t.title,t.service,t.period,clientOf(t.client_id),nameOf(t.assignee_id),t.notes].join(" ").toLowerCase();
 if(query&&!search.includes(query))return false;
 if(S.filter==="mine"&&t.assignee_id!==S.data.user.id)return false;
 if(S.filter==="overdue"&&!(t.due_date&&t.due_date<today()&&t.status!=="done"))return false;
 if(["todo","in_progress","waiting","blocked","review","done"].includes(S.filter)&&t.status!==S.filter)return false;
 return true;
}
function memberAvatar(person){return '<span class="avatar">'+esc(initials(person))+'</span>';}
function rowTask(t,small=false){
 return '<tr><td><button class="cell-link" data-task="'+esc(t.id)+'">'+esc(clientOf(t.client_id))+'</button><div class="secondary-cell">'+esc(t.title)+'</div></td>'+
  '<td>'+esc(t.service)+(small?'':'<div class="secondary-cell">'+esc(t.period||"—")+'</div>')+'</td>'+
  '<td class="nowrap">'+memberAvatar(nameOf(t.assignee_id))+' <span class="small">'+esc(nameOf(t.assignee_id))+'</span></td>'+
  '<td class="nowrap">'+pretty(t.due_date)+'</td>'+
  '<td>'+tag(t.status)+'</td>'+
  (small?'':'<td><button class="btn sm" data-task="'+esc(t.id)+'">Open</button></td>')+'</tr>';
}
function renderDesk(){
 const tasks=S.data.tasks, overdue=tasks.filter(t=>t.due_date&&t.due_date<today()&&t.status!=="done");
 const counts=[["Pending",tasks.filter(t=>t.status==="todo").length,"blue","todo","list"],["Waiting for Client",tasks.filter(t=>t.status==="waiting").length,"amber","waiting","file"],["In Review",tasks.filter(t=>t.status==="review").length,"violet","review","search"],["Overdue",overdue.length,"rose","overdue","alert"],["Completed",tasks.filter(t=>t.status==="done").length,"green","done","check"]];
 const cards='<div class="cards">'+counts.map(c=>'<button class="kpi '+c[2]+'" data-workfilter="'+c[3]+'"><div><label>'+c[0]+'</label><div class="number">'+c[1]+'</div></div>'+icon(c[4],"kpi-icon")+'</button>').join("")+'</div>';
 const work=tasks.filter(t=>t.status!=="done").slice().sort((a,b)=>(a.due_date||"9999").localeCompare(b.due_date||"9999")).slice(0,8);
 const workPanel=panel("Today’s work",'<p class="muted small">Open and upcoming assignments</p>'+table(["Client / work","Service","Assignee","Due date","Status"],work.map(t=>rowTask(t,true)),"Nothing waiting","Create an assignment to start tracking work."),'<button class="text-button" data-view="work">View all work</button>');
 const members=S.data.staff.map(s=>{
  const assigned=tasks.filter(t=>t.assignee_id===s.id&&t.status!=="done").length;
  const percentage=Math.min(100,Math.round(assigned/12*100));
  return '<div class="stats-line">'+memberAvatar(s.name)+'<div class="grow"><strong class="small">'+esc(s.name)+'</strong><div class="hint">'+esc(s.role)+'</div></div><div class="progress" title="'+assigned+' active assignments"><i style="width:'+percentage+'%"></i></div><span class="tiny">'+assigned+' work</span></div>';
 }).join("");
 const teamPanel=panel("Team workload",members||'<div class="empty">No staff yet</div>','<button class="text-button" data-view="team">View team</button>');
 const deadlines=work.filter(t=>t.due_date).slice(0,8).map(t=>'<div class="stats-line"><div class="grow"><strong class="small">'+esc(t.service)+'</strong><div class="hint">'+esc(clientOf(t.client_id))+' · '+esc(t.title)+'</div></div><span class="tiny nowrap">'+pretty(t.due_date)+'</span></div>').join("");
 const calendarPanel=panel("Upcoming deadlines",deadlines||'<div class="empty">No deadlines configured yet</div>','<button class="text-button" data-view="compliance">Calendar</button>');
 const review=tasks.filter(t=>t.status==="review").slice(0,7).map(t=>'<div class="stats-line"><div class="grow"><strong class="small">'+esc(clientOf(t.client_id))+'</strong><div class="hint">'+esc(t.title)+'</div></div><button class="btn sm" data-task="'+esc(t.id)+'">Review</button></div>').join("");
 const reviewPanel=panel("Review queue",review||'<div class="empty">Nothing awaiting review</div>');
 return heading("Desk","Firm overview, today’s work and upcoming compliance",btn(icon("plus")+" New assignment","modal:task","primary"))+cards+'<div class="desk-grid">'+workPanel+teamPanel+calendarPanel+reviewPanel+'</div>';
}
function renderWork(){
 const filtered=S.data.tasks.filter(taskVisible);
 const filterOptions=[["all","All"],["mine","Mine"],["todo","Pending"],["waiting","Waiting"],["review","In review"],["overdue","Overdue"],["done","Completed"]];
 return heading("Work Register","All work · "+new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"}), (permitted()?btn(icon("plus")+" New work","modal:task","primary"):"")+btn(icon("download")+" Export CSV","export:tasks"))+
 '<div class="segmented">'+filterOptions.map(opt=>'<button class="chip '+(S.filter===opt[0]?"active":"")+'" data-filter="'+opt[0]+'">'+opt[1]+'</button>').join("")+'</div>'+
 '<div class="toolbar"><input class="search" id="main-search" data-search placeholder="Search clients, work, services, assignees…" value="'+esc(S.q)+'" aria-label="Search work register">'+btn(icon("refresh")+" Refresh","refresh")+'</div>'+
 '<div class="panel">'+table(["Client / work","Service / period","Assignee","Due date","Status","Actions"],filtered.map(t=>rowTask(t)),"No matching assignments","Change the filter or create work.")+'</div>'+
 (S.selected&&task(S.selected)?renderTaskDetail(task(S.selected)):"");
}
function renderTaskDetail(t){
 const privileged=permitted(),allowedStatuses=["todo","in_progress","waiting","blocked","review",...(privileged?["done"]:[])];
 const docs=S.data.documents.filter(d=>d.task_id===t.id);
 return '<section class="detail-card" style="margin-top:17px"><div class="detail-head"><div><div class="muted tiny">ASSIGNMENT DETAILS</div><h2>'+esc(t.title)+'</h2><div class="muted small">'+esc(clientOf(t.client_id))+' · '+esc(t.service)+' · '+esc(t.period||"Unspecified period")+'</div></div><button class="close-button" data-action="close-detail" aria-label="Close details">'+icon("close")+'</button></div>'+
 '<div class="detail-kv"><div><label>Assignee</label><span>'+esc(nameOf(t.assignee_id))+'</span></div><div><label>Due date</label><span>'+pretty(t.due_date)+'</span></div><div><label>Reviewer</label><span>'+esc(nameOf(t.reviewer_id))+'</span></div><div><label>Priority</label>'+priority(t.priority)+'</div></div>'+
 '<div class="field" style="max-width:280px;margin-top:20px"><label for="task-status">Update status</label><select id="task-status" data-task-status="'+esc(t.id)+'">'+allowedStatuses.map(st=>'<option value="'+st+'" '+(st===t.status?"selected":"")+'>'+labelStatus(st)+'</option>').join("")+'</select></div>'+
 '<div class="detail-tabs"><span>Required documents ('+docs.length+')</span></div>'+
 (docs.length?docs.map(d=>'<div class="detail-mini"><strong>'+esc(d.name)+'</strong> · '+tag(d.status)+'</div>').join(""):'<p class="muted small">No document checklist yet.</p>')+
 '<div style="margin-top:17px">'+btn(icon("plus")+" Add document requirement","modal:document","")+'</div></section>';
}
function renderClients(){
 const q=S.q.trim().toLowerCase(),clients=S.data.clients.filter(c=>[c.name,c.email,c.pan,c.gstin,c.category].join(" ").toLowerCase().includes(q));
 const rows=clients.map(c=>'<tr><td><button class="cell-link" data-client="'+esc(c.id)+'">'+esc(c.name)+'</button><div class="secondary-cell">'+esc(c.category)+'</div></td><td>'+esc(c.email||"—")+'</td><td>'+esc(c.phone||"—")+'</td><td>'+S.data.tasks.filter(t=>t.client_id===c.id&&t.status!=="done").length+'</td><td>'+pretty(c.created_at)+'</td><td><button class="btn sm" data-client="'+esc(c.id)+'">View</button></td></tr>');
 return heading("Client Master","Central client records and service history",(permitted()?btn(icon("plus")+" New client","modal:client","primary"):"")+btn(icon("download")+" Export CSV","export:clients"))+
 '<div class="toolbar"><input class="search" id="main-search" data-search placeholder="Search client, email, PAN or GSTIN…" value="'+esc(S.q)+'" aria-label="Search clients"></div>'+
 '<div class="'+(S.selected&&client(S.selected)?"split-grid":"")+'"><div class="panel">'+table(["Client","Email","Phone","Active work","Created",""],rows,"No clients found","Add a client to begin managing the firm.")+'</div>'+(S.selected&&client(S.selected)?renderClientDetail(client(S.selected)):"")+'</div>';
}
function renderClientDetail(c){
 const ts=S.data.tasks.filter(t=>t.client_id===c.id);
 const ds=S.data.documents.filter(d=>d.client_id===c.id);
 return '<section class="detail-card"><div class="detail-head"><div><div class="muted tiny">CLIENT MASTER</div><h2>'+esc(c.name)+'</h2><span class="tag todo">'+esc(c.category)+'</span></div><button class="close-button" data-action="close-detail" aria-label="Close details">'+icon("close")+'</button></div>'+
 '<div class="detail-kv"><div><label>Email</label><span>'+text(c.email)+'</span></div><div><label>Phone</label><span>'+text(c.phone)+'</span></div><div><label>PAN</label><span>'+(c.pan?"••••"+esc(c.pan.slice(-4)):"—")+'</span></div><div><label>GSTIN</label><span>'+(c.gstin?"••••"+esc(c.gstin.slice(-4)):"—")+'</span></div></div>'+
 '<div class="detail-tabs"><span>Assignments ('+ts.length+')</span></div>'+
 (ts.length?ts.map(t=>'<div class="detail-mini"><strong>'+esc(t.title)+'</strong><p>'+esc(t.service)+' · '+pretty(t.due_date)+' · '+esc(labelStatus(t.status))+'</p></div>').join(""):'<p class="muted small">No assignments recorded.</p>')+
 '<hr class="subtle-sep"><div class="muted small">'+ds.filter(d=>d.status==="missing").length+' missing documents</div></section>';
}
function renderDocuments(){
 const q=S.q.trim().toLowerCase(),docs=S.data.documents.filter(d=>[d.name,clientOf(d.client_id),task(d.task_id)?.title].join(" ").toLowerCase().includes(q));
 const rows=docs.map(d=>'<tr><td><button class="cell-link" data-document="'+esc(d.id)+'">'+esc(clientOf(d.client_id))+'</button><div class="secondary-cell">'+esc(task(d.task_id)?.service||"—")+'</div></td><td>'+esc(task(d.task_id)?.title||"—")+'</td><td><button class="cell-link" data-document="'+esc(d.id)+'">'+esc(d.name)+'</button></td><td>'+tag(d.status)+'</td><td>'+pretty(d.requested_at)+'</td><td>'+pretty(d.updated_at)+'</td><td><button class="btn sm" data-document="'+esc(d.id)+'">Open</button></td></tr>');
 const selected=S.data.documents.find(d=>d.id===S.selected);
 return heading("Document Register","Missing and received client data",btn(icon("plus")+" Add requirement","modal:document","primary")+btn(icon("download")+" Export CSV","export:documents"))+
 '<div class="toolbar"><input class="search" id="main-search" data-search placeholder="Search client, assignment or document…" value="'+esc(S.q)+'" aria-label="Search documents">'+btn(icon("refresh")+" Refresh","refresh")+'</div>'+
 '<div class="segmented"><span class="chip">All <b>'+S.data.documents.length+'</b></span><span class="chip">Missing <b>'+S.data.documents.filter(d=>d.status==="missing").length+'</b></span><span class="chip">Requested <b>'+S.data.documents.filter(d=>d.status==="requested").length+'</b></span><span class="chip">Verified <b>'+S.data.documents.filter(d=>d.status==="verified").length+'</b></span></div>'+
 '<div class="'+(selected?"split-grid":"")+'"><div class="panel">'+table(["Client","Assignment","Document","Status","Requested","Updated",""],rows,"No document requirements yet","Create a document requirement for an assignment.")+'</div>'+(selected?renderDocumentDetail(selected):"")+'</div>';
}
function draftFor(d){
 const t=task(d.task_id);
 return "Dear Sir/Madam,\n\nPlease share the "+d.name+" required for "+(t?.title||"your assignment")+" ("+(t?.period||"current period")+").\n\nRegards,\n"+(S.data.firm?.name||"Chamber");
}
function renderDocumentDetail(d){
 const draft=draftFor(d),allowed=["missing","requested","received","rejected",...(permitted()?["verified","not_applicable"]:[])];
 return '<section class="detail-card"><div class="detail-head"><div><div class="muted tiny">DOCUMENT REQUIREMENT</div><h2>'+esc(d.name)+'</h2><div class="muted small">'+esc(clientOf(d.client_id))+'</div></div><button class="close-button" data-action="close-detail" aria-label="Close details">'+icon("close")+'</button></div>'+
 '<div class="detail-kv"><div><label>Assignment</label><span>'+esc(task(d.task_id)?.title||"—")+'</span></div><div><label>Status</label>'+tag(d.status)+'</div><div><label>Requested</label><span>'+pretty(d.requested_at)+'</span></div><div><label>Last updated</label><span>'+pretty(d.updated_at)+'</span></div></div>'+
 '<div class="field" style="margin-top:22px"><label>Update document status</label><select data-document-status="'+esc(d.id)+'">'+allowed.map(x=>'<option value="'+x+'" '+(x===d.status?"selected":"")+'>'+labelStatus(x)+'</option>').join("")+'</select></div>'+
 '<hr class="subtle-sep"><div class="section-heading">Client request draft</div><div class="notice" style="white-space:pre-wrap">'+esc(draft)+'</div>'+
 '<div class="actions" style="margin-top:13px"><button class="btn sm" data-copy-document="'+esc(d.id)+'">'+icon("copy")+' Copy message</button><button class="btn sm" data-email-document="'+esc(d.id)+'">Open email draft</button></div>'+
 '<p class="hint" style="margin-top:10px">No message is sent automatically. Use an approved account to contact the client, then record the status.</p></section>';
}
function renderCompliance(){
 const due=S.data.tasks.filter(t=>t.due_date&&t.status!=="done").slice().sort((a,b)=>a.due_date.localeCompare(b.due_date));
 const rows=due.map(t=>'<tr><td><button class="cell-link" data-task="'+esc(t.id)+'">'+esc(clientOf(t.client_id))+'</button></td><td>'+esc(t.service)+'</td><td>'+esc(t.period||"—")+'</td><td class="nowrap">'+pretty(t.due_date)+'</td><td>'+tag(t.status)+'</td></tr>');
 return heading("Compliance Calendar","Assignment deadlines and reporting periods",btn(icon("plus")+" New assignment","modal:task","primary"))+
 '<div class="notice" style="margin-bottom:18px">This is a calendar of firm-entered assignment dates, not a verified statutory due-date service. Recurring templates and legally verified filing deadlines require a separate implementation and review.</div>'+
 panel("Upcoming deadlines",table(["Client","Service","Period","Due date","Status"],rows,"No due dates yet","Create work with a due date to populate this calendar."))+
 '<div style="margin-top:14px">'+panel("Recurring service templates",S.data.templates.length?S.data.templates.map(t=>'<div class="stats-line"><div class="grow"><strong>'+esc(t.name)+'</strong><div class="hint">'+esc(t.frequency)+' · '+esc(t.service)+'</div></div></div>').join(""):'<div class="empty"><strong>Recurrence not configured</strong><p>Automated generation is planned in the next phase.</p></div>')+'</div>';
}
function renderTeam(){
 const members=S.data.staff,ts=S.data.tasks;
 const rows=members.map(s=>{
 const assigned=ts.filter(t=>t.assignee_id===s.id&&t.status!=="done").length;
 const completed=ts.filter(t=>t.assignee_id===s.id&&t.status==="done").length;
 return '<tr><td><div style="display:flex;align-items:center;gap:9px">'+memberAvatar(s.name)+'<div><div class="primary-cell">'+esc(s.name)+'</div><div class="secondary-cell">'+esc(s.email)+'</div></div></div></td><td><span class="tag '+esc(s.role)+'">'+esc(s.role)+'</span></td><td>'+assigned+'</td><td>'+completed+'</td><td>'+ (assigned===0?'<span class="tag done">Available</span>':'<span class="tag in_progress">Assigned</span>')+'</td></tr>';
 });
 return heading("Team Register","Assignment distribution and staff availability",S.data.user.role==="principal"?btn(icon("plus")+" Add staff","modal:staff","primary"):"")+
 '<div class="notice" style="margin-bottom:18px">Availability means no currently assigned open work in Chamber; it does not indicate that a person is idle or available outside the system.</div>'+
 '<div class="panel">'+table(["Member","Role","Active work","Completed","Assignment status"],rows,"No members yet","Add firm staff to distribute work.")+'</div>';
}
function renderReports(){
 const ts=S.data.tasks,ds=S.data.documents;
 const stats=[["Total assignments",ts.length],["Completed",ts.filter(t=>t.status==="done").length],["Waiting for client",ts.filter(t=>t.status==="waiting").length],["Missing documents",ds.filter(d=>d.status==="missing").length]];
 const summary='<div class="cards" style="grid-template-columns:repeat(4,minmax(0,1fr))">'+stats.map(s=>'<div class="kpi"><div><label>'+s[0]+'</label><div class="number">'+s[1]+'</div></div></div>').join("")+'</div>';
 const rows=S.data.staff.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+ts.filter(t=>t.assignee_id===s.id&&t.status!=="done").length+'</td><td>'+ts.filter(t=>t.assignee_id===s.id&&t.status==="done").length+'</td><td>'+ts.filter(t=>t.assignee_id===s.id&&t.status==="review").length+'</td></tr>');
 return heading("Reports","Operational overview and work ownership",btn(icon("download")+" Export work","export:tasks"))+summary+
 panel("Work by staff",table(["Staff","Open","Completed","In review"],rows,"No team records","Staff records will appear here."));
}
function renderActivity(){
 const events=S.data.activity.map(a=>'<div class="event"><strong>'+esc(a.actor_name||"Unknown member")+' · '+esc(a.event)+' '+esc(a.entity_type)+'</strong><p>'+esc(a.entity_type)+" · "+esc(a.entity_id.slice(0,8))+'</p><time>'+pretty(a.at)+' · '+esc(new Date(a.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}))+'</time></div>').join("");
 return heading("Activity & Sync","Timestamped work changes and system status",btn(icon("refresh")+" Refresh","refresh"))+
 '<div class="split-grid">'+panel("Activity trail",'<div class="timeline">'+(events||'<div class="empty"><strong>No activity recorded</strong><p>Creating and updating work creates audit entries.</p></div>')+'</div>')+
 panel("System status",'<div class="stats-line"><span class="green-dot"></span><strong class="small">Connected to Chamber API</strong></div><div class="stats-line"><div class="grow"><strong class="small">Data source</strong><div class="hint">Cloudflare D1 database</div></div></div><div class="stats-line"><div class="grow"><strong class="small">Last loaded</strong><div class="hint">'+esc(S.loadedAt||"Not loaded")+'</div></div></div><div class="notice">Email and WhatsApp integrations are not configured. Do not treat drafted or copied messages as delivered.</div>')+'</div>';
}
function renderSettings(){
 return heading("Settings","Firm and account configuration")+
 panel("Current firm",'<div class="detail-kv"><div><label>Firm</label><span>'+esc(S.data.firm?.name||"—")+'</span></div><div><label>Signed in as</label><span>'+esc(S.data.user.name)+'</span></div><div><label>Role</label><span>'+esc(S.data.user.role)+'</span></div><div><label>Email</label><span>'+esc(S.data.user.email)+'</span></div></div><div style="margin-top:20px">'+btn(icon("logout")+" Sign out","logout")+'</div>')+
 '<div style="margin-top:15px">'+panel("Planned integrations",'<p class="small muted">Email, official WhatsApp Business, recurring tax deadline rules, Google Sheets and file uploads will be enabled only after their backend integrations and permission checks are ready.</p>')+'</div>';
}
function renderAuth(){
 const setup=S.session?.needs_setup;
 const title=setup?"Create your firm":"Sign in to Chamber";
 const subtitle=setup?"One-time secure setup for the first principal.":"Manage clients, assignments and documents in one workspace.";
 const fields=(setup?field("Firm name","firm","text",true)+field("Your name","name","text",true):"")+
 field("Work email","email","email",true)+field("Password","password","password",true)+
 (setup?field("One-time setup token","setup_token","password",true):"");
 return '<div class="form-screen"><div class="auth-card"><div class="brand"><span class="brand-mark">'+icon("briefcase")+'</span> CHAMBER</div><h1>'+title+'</h1><p>'+subtitle+'</p>'+
 (S.error?'<div class="alert">'+esc(S.error)+'</div>':"")+
 '<form data-form="'+(setup?"setup":"login")+'"><div class="fields">'+fields+'</div><div class="form-actions"><button type="submit" class="btn primary">'+(setup?"Create firm":"Sign in")+'</button></div></form><p class="hint" style="margin-top:18px">Private firm records. Sign-in is required.</p></div></div>';
}
function field(label,name,type="text",required=false,extra=""){
 const req=required?' required':'';
 return '<div class="field full"><label for="f-'+name+'">'+esc(label)+(required?' <span class="required">*</span>':'')+'</label><input id="f-'+name+'" name="'+name+'" type="'+type+'"'+req+' '+extra+'></div>';
}
function choose(label,name,items,required=true){
 return '<div class="field"><label for="f-'+name+'">'+esc(label)+'</label><select id="f-'+name+'" name="'+name+'" '+(required?"required":"")+'><option value="">Select…</option>'+items.map(item=>'<option value="'+esc(item[0])+'">'+esc(item[1])+'</option>').join("")+'</select></div>';
}
function modal(){
 if(!S.modal)return "";
 let title="",content="";
 if(S.modal==="client"){
  title="New client";
  content=field("Legal / trading name","name","text",true)+choose("Type","category",[["Business","Business"],["Individual","Individual"],["Partnership","Partnership"],["Company","Company"],["Trust","Trust"]])+
   field("Email","email","email")+field("Phone","phone")+field("PAN","pan")+field("GSTIN","gstin")+
   '<div class="field full"><label>Notes</label><textarea name="notes" maxlength="1000"></textarea></div>';
 }else if(S.modal==="task"){
  title="New assignment";
  content=choose("Client","client_id",S.data.clients.map(c=>[c.id,c.name]))+
   field("Work title","title","text",true)+field("Service (e.g. GST / TDS)","service","text",true)+
   field("Work period (e.g. Oct 2026)","period")+
   field("Due date","due_date","date")+
   choose("Assignee","assignee_id",[["","Unassigned"],...S.data.staff.map(s=>[s.id,s.name])],false)+
   choose("Priority","priority",[["medium","Medium"],["high","High"],["low","Low"]],false)+
   '<div class="field full"><label>Notes</label><textarea name="notes" maxlength="2000"></textarea></div>';
 }else if(S.modal==="document"){
  title="New document requirement";
  const tasks=S.data.tasks.filter(t=>permitted()||t.assignee_id===S.data.user.id);
  content=choose("Assignment","task_id",tasks.map(t=>[t.id,clientOf(t.client_id)+" · "+t.title]))+
   field("Required document","name","text",true)+
   '<p class="hint" style="grid-column:1/-1">The requirement starts as Missing. Mark it requested or received after taking that action.</p>';
 }else if(S.modal==="staff"){
  title="Add firm member";
  content=field("Full name","name","text",true)+field("Work email","email","email",true)+
   choose("Role","role",[["staff","Article / staff"],["manager","Manager"]])+
   field("Initial password (12+ characters)","password","password",true,"minlength=12");
 }else return "";
 return '<div class="overlay" data-overlay><div class="dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="dialog-header"><h2>'+esc(title)+'</h2><button type="button" class="close-button" data-action="close-modal" aria-label="Close dialog">'+icon("close")+'</button></div><div class="dialog-body">'+(S.error?'<div class="alert">'+esc(S.error)+'</div>':"")+
 '<form data-form="'+esc(S.modal)+'"><div class="fields">'+content+'</div><div class="form-actions">'+btn("Cancel","close-modal")+'<button class="btn primary" type="submit">Save record</button></div></form></div></div></div>';
}
function shell(content){
 const current=views.find(v=>v[0]===S.view)||views[0];
 const nav=views.map(v=>'<button class="side-link '+(S.view===v[0]?"active":"")+'" data-view="'+v[0]+'" title="'+v[1]+'">'+icon(v[2])+'<span>'+v[1]+'</span></button>').join("");
 return '<div class="app-layout"><header class="topbar">'+
 '<div class="brand"><span class="brand-mark">'+icon("briefcase")+'</span>CHAMBER</div>'+
 '<div class="breadcrumb">/ <strong>'+esc(current[1])+'</strong></div><span class="fy">FY '+esc(new Date().getMonth()>=3?new Date().getFullYear()+"–"+String(new Date().getFullYear()+1).slice(-2):(new Date().getFullYear()-1)+"–"+String(new Date().getFullYear()).slice(-2))+'</span>'+
 '<button class="header-search" data-action="global-search">'+icon("search")+' Search clients, work, documents… <kbd>Ctrl K</kbd></button>'+
 '<div class="top-user">'+memberAvatar(S.data.user.name)+'<div><div class="name">'+esc(S.data.user.name)+'</div><small>'+esc(S.data.user.role)+'</small></div></div></header>'+
 '<aside class="sidebar" aria-label="Main navigation">'+nav+'<div class="sidebar-spacer"></div><div class="firm-foot">'+icon("briefcase")+'<div><strong>'+esc(S.data.firm?.name||"Firm")+'</strong><br><small>Firm workspace</small></div></div></aside>'+
 '<main class="main-area" id="main-area">'+content+'</main><footer class="statusbar">'+icon("list")+' F1–F4: Navigate <span>·</span> Alt+N: New work <span>·</span> Ctrl+K: Search <span class="push"><span class="green-dot"></span>Connected</span></footer></div>'+
 modal()+(S.toast?'<div class="toast" role="status">'+esc(S.toast)+'</div>':"");
}
function render(){
 if(S.loading){root.innerHTML='<main class="initial-loading">Loading Chamber…</main>';return;}
 if(!S.session?.authenticated){root.innerHTML=renderAuth();return;}
 const pages={desk:renderDesk,work:renderWork,clients:renderClients,documents:renderDocuments,compliance:renderCompliance,team:renderTeam,reports:renderReports,activity:renderActivity,settings:renderSettings};
 root.innerHTML=shell((pages[S.view]||renderDesk)());
}
async function api(path,method="GET",data,headers={}){
 const opts={method,credentials:"same-origin",headers:{...headers}};
 if(data!==undefined){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(data);}
 const response=await fetch(path,opts);
 const value=await response.json().catch(()=>({error:"Invalid server response"}));
 if(!response.ok)throw Error(value.error||"Request failed ("+response.status+")");
 return value;
}
async function load(){
 S.data=await api("/api/bootstrap");S.loadedAt=new Date().toLocaleString("en-IN");S.session={authenticated:true};
 S.loading=false;S.error="";render();
}
async function init(){
 try{
  S.session=await api("/api/session");
  if(S.session.authenticated)await load();
  else {S.loading=false;render();}
 }catch(e){S.loading=false;S.session={authenticated:false,needs_setup:false};S.error=e.message+" — check the Worker and database setup.";render();}
}
function flash(message){S.toast=message;render();setTimeout(()=>{S.toast="";render();},2800);}
function navTo(view){S.view=view;S.selected=null;S.filter="all";S.q="";S.error="";render();}
function openModal(kind){
 if(!S.data)return;S.error="";
 if((kind==="client"||kind==="task")&&!permitted())return flash("Only managers can create this record.");
 if(kind==="staff"&&S.data.user.role!=="principal")return flash("Only principals can add staff.");
 S.modal=kind;render();
}
async function submitForm(form){
 const kind=form.getAttribute("data-form"), fd=new FormData(form),payload=Object.fromEntries(fd.entries());
 const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
 try{
  if(kind==="setup"){
   const setupToken=payload.setup_token;delete payload.setup_token;
   await api("/api/setup","POST",{firm:payload.firm,name:payload.name,email:payload.email,password:payload.password},{"X-Setup-Token":setupToken});
   S.session={authenticated:false,needs_setup:false};S.error="";render();flash("Firm created. Sign in to continue.");return;
  }
  if(kind==="login"){await api("/api/login","POST",payload);await load();return;}
  if(kind==="client")await api("/api/clients","POST",payload);
  if(kind==="task")await api("/api/tasks","POST",payload);
  if(kind==="document")await api("/api/documents","POST",payload);
  if(kind==="staff")await api("/api/staff","POST",payload);
  S.modal=null;S.selected=null;S.error="";await load();flash("Record saved.");
 }catch(e){S.error=e.message;render();}
 finally{if(submit)submit.disabled=false;}
}
async function modifyTask(id,status){
 try{await api("/api/tasks/"+encodeURIComponent(id),"PATCH",{status});await load();S.selected=id;render();flash("Assignment status updated.");}
 catch(e){flash(e.message);}
}
async function modifyDocument(id,status){
 try{await api("/api/documents/"+encodeURIComponent(id),"PATCH",{status});await load();S.selected=id;render();flash("Document status updated.");}
 catch(e){flash(e.message);}
}
function documentById(id){return S.data.documents.find(d=>d.id===id);}
root.addEventListener("click",async event=>{
 const target=event.target.closest("button");
 if(!target)return;
 const view=target.getAttribute("data-view"), filter=target.getAttribute("data-filter"),
  workFilter=target.getAttribute("data-workfilter"), clientId=target.getAttribute("data-client"),
  taskId=target.getAttribute("data-task"), docId=target.getAttribute("data-document");
 if(view){navTo(view);return;}
 if(filter){S.filter=filter;render();return;}
 if(workFilter){navTo("work");S.filter=workFilter;render();return;}
 if(clientId){navTo("clients");S.selected=clientId;render();return;}
 if(taskId){navTo("work");S.selected=taskId;render();return;}
 if(docId){navTo("documents");S.selected=docId;render();return;}
 if(target.dataset.copyDocument){
  const d=documentById(target.dataset.copyDocument);
  if(d){try{await navigator.clipboard.writeText(draftFor(d));flash("Draft copied. This has not been sent.");}catch(e){flash("Clipboard unavailable.");}}return;
 }
 if(target.dataset.emailDocument){
  const d=documentById(target.dataset.emailDocument);
  if(d){const c=client(d.client_id);if(!c?.email)return flash("No client email is recorded.");window.location.href="mailto:"+encodeURIComponent(c.email)+"?subject="+encodeURIComponent("Document request: "+d.name)+"&body="+encodeURIComponent(draftFor(d));}return;
 }
 const action=target.getAttribute("data-action");if(!action)return;
 if(action.startsWith("modal:")){openModal(action.slice(6));return;}
 if(action==="close-modal"){S.modal=null;S.error="";render();return;}
 if(action==="close-detail"){S.selected=null;render();return;}
 if(action==="refresh"){try{await load();flash("Records refreshed.");}catch(e){flash(e.message);}return;}
 if(action==="global-search"){navTo("work");root.querySelector("#main-search")?.focus();return;}
 if(action==="logout"){try{await api("/api/logout","POST",{});S.session={authenticated:false,needs_setup:false};S.data=null;S.modal=null;S.toast="";render();}catch(e){flash(e.message);}return;}
 if(action.startsWith("export:")){
  const kind=action.slice(7);window.location.href="/api/export?kind="+encodeURIComponent(kind);return;
 }
});
root.addEventListener("submit",e=>{const form=e.target.closest("form[data-form]");if(form){e.preventDefault();submitForm(form);}});
root.addEventListener("change",e=>{
 const target=e.target;
 if(target.matches("[data-task-status]"))modifyTask(target.getAttribute("data-task-status"),target.value);
 if(target.matches("[data-document-status]"))modifyDocument(target.getAttribute("data-document-status"),target.value);
});
root.addEventListener("input",e=>{
 if(e.target.matches("[data-search]")){
  const start=e.target.selectionStart;S.q=e.target.value;render();
  const field=root.querySelector("#main-search");if(field){field.focus();try{field.setSelectionRange(start,start);}catch(_e){}}
 }
});
document.addEventListener("keydown",e=>{
 if(!S.session?.authenticated)return;
 const editing=e.target.matches("input,textarea,select,[contenteditable]")||e.target.closest("[contenteditable]");
 if(e.key==="Escape"){S.modal=null;S.selected=null;S.error="";render();return;}
 if(editing)return;
 if(e.ctrlKey&&e.key.toLowerCase()==="k"){e.preventDefault();navTo("work");root.querySelector("#main-search")?.focus();return;}
 if(e.altKey&&e.key.toLowerCase()==="n"){e.preventDefault();openModal("task");return;}
 if(e.altKey&&e.key.toLowerCase()==="c"){e.preventDefault();openModal("client");return;}
 const keys={F1:"desk",F2:"clients",F3:"team",F4:"activity"};
 if(keys[e.key]){e.preventDefault();navTo(keys[e.key]);}
});
init();