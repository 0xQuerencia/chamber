import {useEffect,useMemo,useState,type FormEvent} from "react";
import {CalendarDays,CheckCircle2,FileCheck2,Plus,RefreshCw,ShieldAlert} from "lucide-react";
import {addComplianceHoliday,deleteComplianceHoliday,getComplianceCalendar,getStarterServices,installStarterServices,
 previewComplianceShift,saveComplianceRule} from "./api";
import type {ComplianceCalendar,ComplianceStarter,DueShift} from "./types";
const when=(s:string)=>new Date(s+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
export default function ComplianceRules({principal,preview}:{principal:boolean;preview:boolean}){
 const [starters,setStarters]=useState<ComplianceStarter[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [calendar,setCalendar]=useState<ComplianceCalendar|null>(null);
 const [day,setDay]=useState(15),[shift,setShift]=useState<DueShift>("none"),[lead,setLead]=useState(10);
 const [source,setSource]=useState(""),[markVerified,setMarkVerified]=useState(false),[templateId,setTemplateId]=useState("");
 const [holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState("");
 const [datePreview,setDatePreview]=useState(""),[previewResult,setPreviewResult]=useState("");
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{
  if(preview)return;
  let active=true;
  void Promise.all([getStarterServices(),getComplianceCalendar()]).then(([a,b])=>{
   if(active){setStarters(a.starters);setCalendar(b)}
  }).catch(e=>{if(active)setError(String(e))});
  return()=>{active=false};
 },[preview,version]);
 const current=useMemo(()=>calendar?.templates.find(t=>t.id===templateId),[calendar,templateId]);
 function changeTemplate(id:string){
  setTemplateId(id);
  const t=calendar?.templates.find(t=>t.id===id);
  setDay(t?.due_day??15);setLead(t?.ask_by_lead_days??10);setShift(t?.due_shift??"none");
  setSource(t?.source_reference??"");setMarkVerified(Boolean(t?.verified_at));setPreviewResult("");
 }
 async function run(action:()=>Promise<unknown>,success:string){
  if(preview||!principal||busy)return;
  setBusy(true);setError("");setMessage("");
  try{await action();setMessage(success);setVersion(v=>v+1)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function install(){
  if(!selected.length)return;
  await run(async()=>{await installStarterServices(selected);setSelected([])},selected.length+" starter workflows installed. Verify due rules before enrolling clients.");
 }
 async function saveRule(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!templateId)return;
  await run(()=>saveComplianceRule(templateId,day,shift,lead,source,markVerified),"Due rule saved. Existing tasks retain their dates until a sourced override is entered.");
 }
 async function addHoliday(e:FormEvent<HTMLFormElement>){
  e.preventDefault();await run(async()=>{await addComplianceHoliday(holidayDate,holidayName);setHolidayDate("");setHolidayName("")},"Firm holiday recorded.");
 }
 async function previewDue(){
  if(!datePreview)return;
  setError("");
  try{
   const result=await previewComplianceShift(datePreview,shift);
   setPreviewResult(result.original+" → "+result.adjusted);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 return <section className="compliance-rules">
  <div className="compliance-rule-heading"><h2><CalendarDays size={18}/> Calendar rules and starter services</h2>
   <button type="button" className="tracker-btn" disabled={preview} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={13}/> Recheck</button></div>
  <div className="compliance-rule-warning"><ShieldAlert size={16}/>
   <p><strong>Planning rules, not statutory advice.</strong> Suggested due days below are NOT checked against current GST, income-tax, labour or ROC notifications. A principal must verify the applicable official schedule and record the source before an installed starter can generate assignments.</p></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="tracker-notice" role="status">{message}</div>}
  <div className="compliance-rule-grid">
   <div className="compliance-rule-panel">
    <h3>Starter service checklists</h3>
    <p className="muted small">One-click installation creates reusable templates and required-document lists. No clients are automatically enrolled.</p>
    <div className="compliance-starter-list">
     {starters.map(s=><label key={s.code} className={s.installed?"installed":""}>
      <input type="checkbox" disabled={s.installed||busy||!principal||preview} checked={s.installed||selected.includes(s.code)}
       onChange={e=>setSelected(v=>e.target.checked?[...v,s.code]:v.filter(x=>x!==s.code))}/>
      <span><strong>{s.name}</strong><small>{s.service} · {s.frequency} · suggested planning day {s.day} · {s.requirements.length} checklist items</small></span>
      {s.installed&&<CheckCircle2 size={15}/>}
     </label>)}
    </div>
    <button type="button" className="tracker-btn primary" disabled={!principal||preview||busy||selected.length===0} onClick={()=>void install()}>
     <Plus size={14}/> Install {selected.length} selected
    </button>
   </div>
   <div className="compliance-rule-panel">
    <h3>Source-verified due rules</h3>
    <p className="muted small">Configure a template's working-day handling. Rule edits apply to future generated periods. Existing assignments require a separate audited date override.</p>
    <label className="compliance-field">Select service template<select value={templateId} onChange={e=>changeTemplate(e.target.value)}>
     <option value="">Choose a template</option>{calendar?.templates.map(t=><option key={t.id} value={t.id}>{t.name}{t.verified_at?" ✓":t.starter_code?" (unverified)":""}</option>)}
    </select></label>
    {current&&<form className="compliance-form" onSubmit={e=>void saveRule(e)}>
     <div className="compliance-inline"><label className="compliance-field">Planning due day<input type="number" value={day} onChange={e=>setDay(Number(e.target.value))} min={1} max={28}/></label>
      <label className="compliance-field">Ask-by lead days<input type="number" value={lead} onChange={e=>setLead(Number(e.target.value))} min={0} max={90}/></label></div>
     <label className="compliance-field">Weekend / holiday adjustment<select value={shift} onChange={e=>setShift(e.target.value as DueShift)}>
      <option value="none">No adjustment</option><option value="previous_workday">Previous working day</option>
      <option value="next_workday">Next working day</option></select></label>
     <label className="compliance-field">Official notice / source reference<textarea rows={2} maxLength={300} value={source} onChange={e=>setSource(e.target.value)}
      placeholder="Notification / circular number and applicable filing category"/></label>
     <label className="compliance-verify"><input type="checkbox" checked={markVerified} onChange={e=>setMarkVerified(e.target.checked)}/>
      I verified this rule against an official source for our clients</label>
     <div className="compliance-inline"><label className="compliance-field">Preview a base date<input type="date" value={datePreview} onChange={e=>setDatePreview(e.target.value)}/></label>
      <button type="button" className="tracker-btn" onClick={()=>void previewDue()} disabled={!datePreview}>Preview shift</button></div>
     {previewResult&&<p className="compliance-preview"><FileCheck2 size={14}/> {previewResult}</p>}
     <button type="submit" className="tracker-btn primary" disabled={!principal||preview||busy}>Save due rule</button>
    </form>}
    {!current&&<p className="muted small">Choose one of your firm's configured service templates to edit.</p>}
   </div>
  </div>
  <div className="compliance-rule-panel compliance-holidays">
   <h3>Firm holidays</h3><p className="muted small">Only firm-configured holidays affect dates. Working days come from Firm Setup ({calendar?.working_days.join(", ")??"Mon–Sat"}; 0=Sunday).</p>
   <form onSubmit={e=>void addHoliday(e)} className="compliance-holiday-form">
    <label className="compliance-field">Date<input type="date" value={holidayDate} required onChange={e=>setHolidayDate(e.target.value)}/></label>
    <label className="compliance-field">Description<input value={holidayName} required maxLength={100} onChange={e=>setHolidayName(e.target.value)} placeholder="Office closed / regional holiday"/></label>
    <button className="tracker-btn" disabled={busy||preview||!principal} type="submit"><Plus size={13}/> Add holiday</button>
   </form>
   <div className="compliance-holiday-list">{calendar?.holidays.length===0?<p className="muted small">No firm holidays recorded.</p>:calendar?.holidays.map(h=><div key={h.id}>
    <strong>{when(h.date)}</strong><span>{h.name}</span>
    <button type="button" disabled={!principal||busy||preview} onClick={()=>void run(()=>deleteComplianceHoliday(h.id),"Holiday removed.")}>Remove</button>
   </div>)}</div>
  </div>
 </section>;
}
