import { useEffect, useMemo, useState } from "react";
import DeliveryPanel from "./DeliveryPanel";
import { ClipboardList, Copy, Mail, MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { cancelMessageBatch, createMessageTemplate, draftBulkMessages, getMessageBatch, getMessageBatches, getMessageTemplates, previewBulkMessages } from "./api";
import type { MessageBatch, MessageBatchDetail, MessageChannel, MessagePreview, MessageTemplate, Workspace } from "./types";

const DEFAULT_MESSAGE="Dear {client},\n\nPlease provide the following documents for {month}:\n{missing_list}\n\nRequested by: {due}\n\nRegards,\nChamber";
const month=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
function externalLink(channel:MessageChannel,recipient:string,body:string){
 if(channel==="email")return "mailto:"+encodeURIComponent(recipient)+"?subject="+encodeURIComponent("Document request")+"&body="+encodeURIComponent(body);
 const digits=recipient.replace(/\D/g,"");
 return digits?"https://wa.me/"+digits+"?text="+encodeURIComponent(body):"";
}
function statusText(raw:string){return raw.replaceAll("_"," ")}
export default function Composer({workspace,preview:demo,onRefresh}:{workspace:Workspace;preview:boolean;onRefresh:()=>Promise<void>}){
 const privileged=workspace.user.role==="principal"||workspace.user.role==="manager";
 const [channel,setChannel]=useState<MessageChannel>("email");
 const [period,setPeriod]=useState(month);
 const [selected,setSelected]=useState<string[]>([]);
 const [search,setSearch]=useState("");
 const [body,setBody]=useState(DEFAULT_MESSAGE);
 const [templateId,setTemplateId]=useState("");
 const [templates,setTemplates]=useState<MessageTemplate[]>([]);
 const [preview,setPreview]=useState<MessagePreview|null>(null);
 const [batch,setBatch]=useState<MessageBatchDetail|null>(null);
 const [past,setPast]=useState<MessageBatch[]>([]);
 const [selectedPreview,setSelectedPreview]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [templateName,setTemplateName]=useState("");
 const [showTemplates,setShowTemplates]=useState(false);
 const canEdit=privileged&&!demo;
 const clients=useMemo(()=>workspace.clients.filter(c=>(c.name+" "+(c.code||"")).toLowerCase().includes(search.toLowerCase())),[workspace.clients,search]);
 const chosenTemplate=templates.find(t=>t.id===templateId);
 const effectiveBody=chosenTemplate?.body??body;

 useEffect(()=>{
  let active=true;
  if(!canEdit)return;
  void Promise.all([getMessageTemplates(),getMessageBatches()]).then(([t,b])=>{
   if(active){setTemplates(t.templates);setPast(b.batches)}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))});
  return()=>{active=false};
 },[canEdit]);

 function invalidate(){setPreview(null);setBatch(null);setMessage("");setError("");}
 function updateChannel(next:MessageChannel){setChannel(next);setTemplateId("");invalidate()}
 function selectClient(id:string){setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);invalidate()}
 function toggleAll(){
  const visible=clients.slice(0,50).map(c=>c.id);
  setSelected(prev=>visible.every(id=>prev.includes(id))?prev.filter(id=>!visible.includes(id)):[...new Set([...prev,...visible])].slice(0,50));
  invalidate();
 }
 async function getPreview(){
  if(!canEdit||selected.length<1||selected.length>50)return;
  setBusy(true);setError("");setMessage("");setPreview(null);setBatch(null);
  try{
   const result=await previewBulkMessages(selected,period,channel,body,templateId||undefined);
   setPreview(result);setSelectedPreview(Math.max(0,result.previews.findIndex(p=>p.eligible)));
   setMessage("Review every recipient before creating a draft batch. No messages have been sent.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function createDraft(){
  if(!canEdit||!preview||!preview.eligible||busy)return;
  setBusy(true);setError("");
  try{
   const d=await draftBulkMessages(selected,period,channel,preview.eligible,body,templateId||undefined);
   const result=await getMessageBatch(d.id);
   setBatch(result);setPreview(null);setPast(old=>[{id:d.id,channel,period,status:"draft",recipient_count:d.recipient_count},...old]);
   setMessage("Draft batch created for "+d.recipient_count+" clients. Delivery is not connected: open each message manually.");
   await onRefresh();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function openExisting(item:MessageBatch){
  setBusy(true);setError("");
  try{const result=await getMessageBatch(item.id);setBatch(result);setPreview(null)}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function cancelDraft(){
  if(!batch||batch.batch.status!=="draft"||busy)return;
  setBusy(true);setError("");
  try{
   await cancelMessageBatch(batch.batch.id);setBatch({...batch,batch:{...batch.batch,status:"cancelled"},messages:batch.messages.map(m=>({...m,status:"cancelled"}))});
   setPast(old=>old.map(x=>x.id===batch.batch.id?{...x,status:"cancelled"}:x));
   setMessage("Draft cancelled. No messages were sent.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function saveTemplate(){
  if(!canEdit||!templateName.trim()||effectiveBody.length<10)return;
  setBusy(true);setError("");
  try{
   const result=await createMessageTemplate(templateName,channel,effectiveBody);
   setTemplates(old=>[...old,{id:result.id,name:templateName,channel,body:effectiveBody,approval_status:"unsubmitted",category:"document_request",active:1}]);
   setTemplateId(result.id);setTemplateName("");setMessage("Template saved for this firm. This is not an approved WhatsApp Business template.");
   invalidate();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function copyDraft(value:string){
  try{await navigator.clipboard.writeText(value);setMessage("Draft copied. No message has been sent.")}
  catch{setError("Clipboard unavailable.")}
 }

 return <section className="composer-screen">
  <header className="composer-heading"><div><h1>Bulk Client Requests</h1><p>Review missing information by client, prepare recipient-specific requests, and keep an auditable draft.</p></div>
   <div className="composer-heading-count"><strong>{selected.length}</strong> clients selected</div></header>
  {demo&&<p className="tracker-notice">This is a read-only sample. Message delivery and draft creation are disabled.</p>}
  {!privileged&&<p className="tracker-notice">Only principals and managers may prepare communication batches.</p>}
  <div className="composer-disclaimer"><MessageCircle size={16}/><p><strong>Controlled communications.</strong> Manual drafts are available; provider delivery is only enabled when the firm connects Gmail or the official WhatsApp Cloud API and confirms a queue. See the delivery panel for live configuration and per-recipient status.</p></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="tracker-notice" role="status">{message}</div>}

  <div className="composer-layout">
   <div className="composer-controls">
    <section className="composer-panel">
     <h2>1. Choose clients <span>(up to 50 per round)</span></h2>
     <div className="composer-client-filters">
      <input aria-label="Search clients" placeholder="Find client or code" value={search} onChange={e=>setSearch(e.target.value)}/>
      <button disabled={!canEdit||!clients.length} onClick={toggleAll} type="button">{clients.slice(0,50).every(c=>selected.includes(c.id))?"Deselect visible":"Select first 50"}</button>
     </div>
     <div className="composer-clients" role="group" aria-label="Client recipients">
      {clients.length===0?<p className="composer-muted">No clients match.</p>:clients.map(c=><label key={c.id}>
       <input type="checkbox" disabled={!canEdit||(!selected.includes(c.id)&&selected.length>=50)} checked={selected.includes(c.id)} onChange={()=>selectClient(c.id)}/>
       <span><strong>{c.name}</strong><small>{c.code??c.category}</small></span>
      </label>)}
     </div>
    </section>
    <section className="composer-panel">
     <h2>2. Channel, period and request text</h2>
     <div className="composer-form-grid">
      <label>Channel<select value={channel} onChange={e=>updateChannel(e.target.value as MessageChannel)} disabled={!canEdit}>
       <option value="email">Email draft</option><option value="whatsapp">WhatsApp manual chat</option>
      </select></label>
      <label>Work month<input type="month" value={period} onChange={e=>{setPeriod(e.target.value);invalidate()}} disabled={!canEdit}/></label>
     </div>
     <label className="composer-field">Firm template
      <select value={templateId} onChange={e=>{setTemplateId(e.target.value);invalidate()}} disabled={!canEdit}>
       <option value="">Custom / default message</option>{templates.filter(t=>t.channel===channel&&t.active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
     </label>
     <label className="composer-field">Message content<textarea rows={9} value={effectiveBody} disabled={!canEdit||Boolean(templateId)}
      onChange={e=>{setBody(e.target.value);invalidate()}}/></label>
     <p className="composer-muted">Variables: {"{client}"}, {"{month}"}, {"{missing_list}"}, {"{due}"}. Each request contains only that client's missing items.</p>
     <button className="composer-text-link" onClick={()=>setShowTemplates(v=>!v)} disabled={!canEdit}>Save as a reusable template</button>
     {showTemplates&&<div className="composer-save-template"><input placeholder="Template name" value={templateName} onChange={e=>setTemplateName(e.target.value)}/>
      <button disabled={busy||!canEdit||templateName.trim().length===0} onClick={()=>void saveTemplate()}>Save</button></div>}
     <button className="tracker-btn primary" disabled={!canEdit||busy||!selected.length||selected.length>50} onClick={()=>void getPreview()}>Preview {selected.length||"selected"} client requests</button>
    </section>
   </div>
   <div className="composer-results">
    {preview&&<section className="composer-panel" aria-label="Recipient preview">
     <header className="composer-review-head"><h2>3. Verify recipients</h2><span>{preview.eligible} eligible · {preview.skipped} skipped</span></header>
     <p className="composer-muted">Recipients without consent or missing information are excluded. Check each recipient before creating a batch.</p>
     <div className="composer-preview-list">
      {preview.previews.map((p,i)=><button key={p.client_id} type="button" className={selectedPreview===i?"active":""}
       onClick={()=>setSelectedPreview(i)}><span>{p.client_name}</span><small>{p.eligible?p.recipient:p.reason}</small><strong>{p.eligible?"Ready":"Skipped"}</strong></button>)}
     </div>
     {preview.previews[selectedPreview]&&<div className="composer-rendered">
      <h3>{preview.previews[selectedPreview].client_name}</h3>
      <p>{preview.previews[selectedPreview].recipient??preview.previews[selectedPreview].reason}</p>
      {preview.previews[selectedPreview].eligible&&<pre>{preview.previews[selectedPreview].body}</pre>}
     </div>}
     <button className="tracker-btn primary" disabled={!canEdit||busy||preview.eligible===0} onClick={()=>void createDraft()}>
      <ClipboardList size={15}/> Create {preview.eligible} reviewable drafts (not send)</button>
    </section>}
    {batch&&<section className="composer-panel" aria-label="Prepared messages">
     <header className="composer-review-head"><h2>Prepared request batch</h2><span>{statusText(batch.batch.status)} · {batch.batch.recipient_count} clients</span></header>
     <p className="composer-muted">No delivery service is connected. Opening these links uses the user's own email or WhatsApp interface, and sending remains a separate manual action.</p>
     <DeliveryPanel key={batch.batch.id} batch={batch} onUpdate={setBatch} principal={workspace.user.role==="principal"} disabled={!canEdit||busy}/>
     {batch.messages.map(m=><div className="composer-draft" key={m.id}>
      <div><strong>{m.client_name}</strong><small>{m.recipient} · {statusText(m.status)}</small></div>
      <pre>{m.body}</pre>
      <div className="composer-draft-actions">
       <button onClick={()=>void copyDraft(m.body)}><Copy size={13}/> Copy</button>
       {batch.batch.status==="draft"&&<a href={externalLink(batch.batch.channel,m.recipient,m.body)}
        target={batch.batch.channel==="whatsapp"?"_blank":undefined} rel={batch.batch.channel==="whatsapp"?"noopener noreferrer":undefined}>
        {batch.batch.channel==="email"?<Mail size={13}/>:<MessageCircle size={13}/>}
        Open {batch.batch.channel==="email"?"mail":"WhatsApp"} draft
       </a>}
      </div>
     </div>)}
     {batch.batch.status==="draft"&&<button className="composer-cancel" disabled={busy||!canEdit} onClick={()=>void cancelDraft()}><X size={14}/> Cancel draft batch</button>}
    </section>}
    {!preview&&!batch&&<section className="composer-panel composer-placeholder">
     <Send size={27}/><h2>Recipient-specific previews</h2><p>Select clients and preview. Each client will only see their own requirements. Nothing will be sent automatically.</p>
    </section>}
    <section className="composer-panel">
     <header className="composer-review-head"><h2>Recent request drafts</h2><button type="button" disabled={!canEdit||busy} onClick={()=>void getMessageBatches().then(r=>setPast(r.batches)).catch(e=>setError(String(e)))}><RefreshCw size={14}/></button></header>
     {past.length===0?<p className="composer-muted">No prepared batches yet.</p>:past.slice(0,8).map(p=><button key={p.id} className="composer-past" disabled={!canEdit||busy} onClick={()=>void openExisting(p)}>
      <span>{p.period} · {p.channel}</span><small>{p.recipient_count} clients · {p.status}</small>
     </button>)}
    </section>
   </div>
  </div>
 </section>;
}
