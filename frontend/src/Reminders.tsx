import {useEffect,useState} from "react";
import {CalendarClock,Check,Clock,Mail,MessageSquare,RefreshCw,ShieldAlert,X} from "lucide-react";
import {dismissReminder,draftBulkMessages,getReminderConfig,getReminders,markReminderPrepared,pauseClientReminders,
 previewBulkMessages,refreshReminders,resumeClientReminders,saveReminderConfig} from "./api";
import type {MessageChannel,MessagePreviewItem,ReminderFeed,ReminderItem,ReminderPolicy,ReminderStatus,Workspace} from "./types";

const EMPTY:ReminderPolicy={enabled:0,ask_days:10,remind_days:6,escalate_days:3,max_reminders:4,quiet_start:"21:00",quiet_end:"08:00"};
const statuses:ReminderStatus[]=["pending","prepared","resolved","dismissed"];
function formatDate(d:string|null){if(!d)return "—";const v=new Date(d.length===10?d+"T12:00:00":d);return isNaN(v.getTime())?d:v.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
const futureDate=()=>{
 const d=new Date();d.setDate(d.getDate()+7);return d.toISOString().slice(0,10);
};
export default function Reminders({workspace,preview:sample}:{workspace:Workspace;preview:boolean}){
 const principal=workspace.user.role==="principal",privileged=principal||workspace.user.role==="manager";
 const [policy,setPolicy]=useState<ReminderPolicy>(EMPTY);
 const [feed,setFeed]=useState<ReminderFeed|null>(null);
 const [status,setStatus]=useState<ReminderStatus>("pending"),[page,setPage]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [revision,setRevision]=useState(0);
 const [selected,setSelected]=useState<ReminderItem|null>(null);
 const [channel,setChannel]=useState<MessageChannel>("email");
 const [recipientPreview,setRecipientPreview]=useState<MessagePreviewItem|null>(null);
 const [pauseDate,setPauseDate]=useState(futureDate);
 const [reason,setReason]=useState("");
 const [operation,setOperation]=useState<"pause"|"dismiss"|null>(null);
 useEffect(()=>{
  let alive=true;if(sample||!privileged)return;
  void getReminderConfig().then(r=>{if(alive)setPolicy(r.config)}).catch(e=>{if(alive)setError(String(e))});
  return()=>{alive=false};
 },[sample,privileged,revision]);
 useEffect(()=>{
  let alive=true;if(sample||!privileged)return;
  void getReminders(status,page).then(r=>{if(alive)setFeed(r)}).catch(e=>{if(alive)setError(String(e))});
  return()=>{alive=false};
 },[sample,privileged,status,page,revision]);
 async function execute(work:()=>Promise<unknown>,message:string){
  if(!privileged||sample||busy)return false;
  setBusy(true);setError("");setNotice("");
  try{await work();setNotice(message);setRevision(n=>n+1);return true}
  catch(e){setError(e instanceof Error?e.message:String(e));return false}
  finally{setBusy(false)}
 }
 function closeDetail(){setSelected(null);setRecipientPreview(null);setOperation(null);setReason("")}
 async function openItem(item:ReminderItem){
  setSelected(item);setRecipientPreview(null);setReason("");setOperation(null);setError("");
  if(item.status!=="pending"||sample)return;
  try{
   const p=await previewBulkMessages([item.client_id],item.period,channel);
   setRecipientPreview(p.previews[0]??null);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 async function updateChannel(next:MessageChannel){
  setChannel(next);setRecipientPreview(null);
  if(!selected||sample)return;
  try{
   const p=await previewBulkMessages([selected.client_id],selected.period,next);
   setRecipientPreview(p.previews[0]??null);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 async function draftOne(){
  if(!selected||!recipientPreview?.eligible||!privileged||sample)return;
  const id=selected.id,cid=selected.client_id,period=selected.period,ch=channel;
  if(await execute(async()=>{
   const draft=await draftBulkMessages([cid],period,ch,1);
   await markReminderPrepared(id,draft.id);
  },"Draft prepared and linked to reminder. Nothing was sent."))closeDetail();
 }
 async function savePause(){
  if(!selected||!reason.trim())return;
  const id=selected.client_id,until=pauseDate,r=reason;
  if(await execute(()=>pauseClientReminders(id,until,r),"Client reminders paused until "+formatDate(until)+"."))closeDetail();
 }
 async function dismiss(){
  if(!selected||!reason.trim())return;
  const id=selected.id,r=reason;
  if(await execute(()=>dismissReminder(id,r),"Reminder dismissed with an audit record."))closeDetail();
 }
 const pending=feed?.items??[];
 return <section className="reminders-page">
  <header className="reminders-heading">
   <div><h1>Client Reminders</h1><p>Ask by day −10, remind at −6, escalate at −3. Dates use firm planning rules.</p></div>
   <button className="tracker-btn" type="button" onClick={()=>void execute(()=>refreshReminders(),"Reminder suggestions refreshed. No messages were sent.")} disabled={busy||sample||!privileged}>
    <RefreshCw size={15}/> Refresh suggestions
   </button>
  </header>
  <div className="reminders-warning"><ShieldAlert size={18}/>
   <p><strong>Review-only reminder engine.</strong> The scheduler suggests messages but never sends them. Gmail/WhatsApp provider authorization, delivery receipts and STOP webhooks must be configured before automating delivery.</p>
  </div>
  {sample&&<div className="tracker-notice">Sample workspace: reminder settings and sending are disabled.</div>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {notice&&<div className="tracker-notice" role="status">{notice}</div>}
  <div className="reminders-layout">
   <div className="reminders-main">
    <div className="reminders-policy">
     <header><h2><CalendarClock size={16}/> Reminder policy</h2><span>{policy.enabled?"Suggestions enabled":"Suggestions disabled"}</span></header>
     <div className="reminders-controls">
      {([
       ["ask_days","Ask clients (days before due)"],["remind_days","Follow up (days before due)"],
       ["escalate_days","Escalate (days before due)"],["max_reminders","Maximum suggestions"]
      ] as const).map(([key,label])=><label key={key}>{label}<input type="number" value={policy[key]} min={key==="max_reminders"?1:0} max={key==="max_reminders"?10:60}
       disabled={!principal||sample||busy} onChange={e=>setPolicy(p=>({...p,[key]:Number(e.target.value)}))}/></label>)}
      <label>Quiet hours start (IST)<input type="time" value={policy.quiet_start} disabled={!principal||sample||busy}
       onChange={e=>setPolicy(p=>({...p,quiet_start:e.target.value}))}/></label>
      <label>Quiet hours end (IST)<input type="time" value={policy.quiet_end} disabled={!principal||sample||busy}
       onChange={e=>setPolicy(p=>({...p,quiet_end:e.target.value}))}/></label>
     </div>
     <div className="reminders-policy-footer">
      <label><input type="checkbox" checked={Boolean(policy.enabled)} disabled={!principal||sample||busy}
       onChange={e=>setPolicy(p=>({...p,enabled:e.target.checked?1:0}))}/> Enable suggestions for this firm</label>
      {principal&&<button className="tracker-btn" type="button" disabled={busy||sample}
       onClick={()=>void execute(()=>saveReminderConfig(policy),"Reminder policy saved.")}>Save policy</button>}
     </div>
     <p className="reminders-caption">Quiet hours are saved for future delivery integrations. No automatic sending occurs in the current implementation.</p>
    </div>
    <div className="reminders-list">
     <header><h2>Suggestions</h2><div className="reminders-filter">{statuses.map(s=><button key={s} aria-pressed={status===s} className={status===s?"active":""}
      onClick={()=>{setStatus(s);setPage(0);closeDetail()}}>{s}</button>)}</div></header>
     <div className="reminders-table-scroll"><table><thead><tr><th>Client</th><th>Period / stage</th><th>Missing</th><th>Due date</th><th>Status</th><th/></tr></thead>
      <tbody>{pending.map(item=><tr key={item.id}>
       <td><strong>{item.client_name}</strong><small>{item.client_code||"No code"}</small></td>
       <td>{item.period}<small>{item.stage}</small></td>
       <td>{item.missing_count}</td><td>{formatDate(item.due_date)}</td>
       <td>{item.paused_until?<span className="reminders-paused">Paused until {formatDate(item.paused_until)}</span>:item.status}</td>
       <td><button className="tracker-btn" type="button" onClick={()=>void openItem(item)}>{item.status==="pending"?"Review":"Details"}</button></td>
      </tr>)}
      {!pending.length&&<tr><td colSpan={6} className="reminders-empty">No {status} suggestions. Enable the policy and refresh after creating dated tasks with missing requirements.</td></tr>}
      </tbody></table></div>
     <footer><span>{feed?.total??0} total {status} suggestions</span><div>
      <button disabled={page===0||busy} onClick={()=>setPage(n=>Math.max(0,n-1))}>Previous</button><span>Page {page+1}</span>
      <button disabled={busy||!feed||(page+1)*50>=feed.total} onClick={()=>setPage(n=>n+1)}>Next</button>
     </div></footer>
    </div>
   </div>
   {selected&&<aside className="reminders-detail" aria-label="Reminder review">
    <header><div><span>{selected.stage.toUpperCase()} · {selected.period}</span><h2>{selected.client_name}</h2>
     <p>{selected.missing_count} missing items · Due {formatDate(selected.due_date)}</p></div>
     <button type="button" aria-label="Close reminder" onClick={closeDetail}><X size={17}/></button>
    </header>
    {selected.status==="pending"&&<>
     <div className="reminders-detail-section">
      <h3><Mail size={16}/> Request preview</h3>
      <label>Draft channel<select value={channel} onChange={e=>void updateChannel(e.target.value as MessageChannel)} disabled={busy||sample}>
       <option value="email">Email</option><option value="whatsapp">WhatsApp</option>
      </select></label>
      {!recipientPreview?<p>Checking eligible contacts and missing requirements…</p>:
       !recipientPreview.eligible?<div className="reminders-caption">{recipientPreview.reason||"Recipient is not eligible."}</div>:
       <><p className="reminders-caption">Recipient: {recipientPreview.recipient}</p><pre>{recipientPreview.body}</pre>
        <button className="tracker-btn primary" type="button" disabled={busy||sample||Boolean(selected.paused_until)}
         onClick={()=>void draftOne()}><MessageSquare size={15}/> Save reviewed draft (not send)</button></>}
     </div>
     <div className="reminders-detail-section">
      <h3><Clock size={15}/> Client pause or dismissal</h3>
      <div className="reminders-actions">
       <button type="button" onClick={()=>setOperation("pause")} disabled={busy||sample}>Pause client</button>
       <button type="button" onClick={()=>setOperation("dismiss")} disabled={busy||sample}>Dismiss suggestion</button>
       {selected.paused_until&&<button type="button" onClick={()=>void execute(()=>resumeClientReminders(selected.client_id),"Client resumed.")} disabled={busy||sample}>Resume</button>}
      </div>
      {operation&&<div className="reminders-action-form">
       {operation==="pause"&&<label>Pause until<input type="date" value={pauseDate} onChange={e=>setPauseDate(e.target.value)}/></label>}
       <label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} rows={3} placeholder="Why is this being paused or dismissed?"/></label>
       <button type="button" className="tracker-btn" disabled={busy||!reason.trim()} onClick={()=>void (operation==="pause"?savePause():dismiss())}><Check size={14}/> Confirm {operation}</button>
      </div>}
     </div>
    </>}
    {selected.status!=="pending"&&<p className="reminders-caption">This suggestion is {selected.status}. Historical entries remain visible for auditability.</p>}
   </aside>}
  </div>
 </section>;
}
