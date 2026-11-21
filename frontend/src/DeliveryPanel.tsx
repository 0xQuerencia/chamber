import {useEffect,useState} from "react";
import {CheckCircle2,RefreshCw,Send,ShieldCheck,X} from "lucide-react";
import {approveWhatsAppTemplate,getDeliveryReadiness,getMessageBatch,getMessageTemplates,queueMessageBatch,retryFailedMessage,undoQueuedBatch} from "./api";
import type {DeliveryReadiness,MessageBatchDetail,MessageTemplate} from "./types";

export default function DeliveryPanel({batch,onUpdate,principal,disabled}:{
 batch:MessageBatchDetail;onUpdate:(batch:MessageBatchDetail)=>void;principal:boolean;disabled:boolean
}){
 const [readiness,setReadiness]=useState<DeliveryReadiness|null>(null);
 const [templates,setTemplates]=useState<MessageTemplate[]>([]);
 const [chosen,setChosen]=useState("");
 const [providerName,setProviderName]=useState("");
 const [language,setLanguage]=useState("en_US");
 const [scheduled,setScheduled]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  let open=true;
  void Promise.all([getDeliveryReadiness(),getMessageTemplates()]).then(([ready,result])=>{
   if(open){setReadiness(ready);setTemplates(result.templates)}
  }).catch(e=>{if(open)setError(String(e))});
  return()=>{open=false};
 },[]);
 const ready=Boolean(readiness?.[batch.batch.channel]);
 async function run(action:()=>Promise<unknown>,message:string){
  if(disabled||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   await action();onUpdate(await getMessageBatch(batch.batch.id));setNotice(message);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function queue(){
  if(batch.batch.status!=="draft"||!ready)return;
  if(!window.confirm("Queue "+batch.batch.recipient_count+" "+batch.batch.channel+" messages for delivery? You can undo within 30 seconds."))return;
  let at:string|undefined;
  if(scheduled){
   const timestamp=Date.parse(scheduled);
   if(!Number.isFinite(timestamp)){setError("Choose a valid scheduled time");return}
   at=new Date(timestamp).toISOString();
  }
  await run(()=>queueMessageBatch(batch.batch.id,batch.batch.recipient_count,at),
   "Batch queued for delivery. Undo is available for 30 seconds.");
 }
 async function approve(){
  if(!principal||!chosen||!providerName.trim())return;
  setBusy(true);setError("");
  try{
   const res=await approveWhatsAppTemplate(chosen,providerName,language);
   setTemplates(old=>old.map(t=>t.id===chosen?{...t,provider_template_id:providerName,language_code:language,approval_status:"approved"}:t));
   setNotice(res.note);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <section className="composer-delivery" aria-label="Provider delivery controls">
  <header><h3><ShieldCheck size={15}/> Firm delivery</h3>
   <button type="button" className="tracker-btn" onClick={()=>void run(async()=>{},"Provider message statuses refreshed.")} disabled={busy}><RefreshCw size={13}/> Refresh</button>
  </header>
  <p className="composer-muted">Gmail {readiness?.email?"is configured":"is not connected"}; WhatsApp Cloud API {readiness?.whatsapp?"is configured":"is not connected"}. No draft is delivered without an explicit confirmation. Provider acceptance and confirmed delivery are different states.</p>
  {error&&<div className="alert" role="alert">{error}</div>}
  {notice&&<div className="tracker-notice" role="status">{notice}</div>}
  {batch.batch.channel==="whatsapp"&&principal&&batch.batch.status==="draft"&&<div className="composer-provider-config">
   <h4>Approved WhatsApp template</h4>
   <p className="composer-muted">Enter only a template officially approved in WhatsApp Manager, with body placeholders in this order: client, period, missing list, due date.</p>
   <select aria-label="WhatsApp template" value={chosen} onChange={e=>setChosen(e.target.value)}>
    <option value="">Select firm template</option>
    {templates.filter(t=>t.channel==="whatsapp"&&t.active).map(t=><option value={t.id} key={t.id}>{t.name}{t.approval_status==="approved"?" (approved)":""}</option>)}
   </select>
   <input aria-label="Approved provider template name" value={providerName} onChange={e=>setProviderName(e.target.value)} placeholder="Meta-approved template name"/>
   <input aria-label="Meta language code" value={language} onChange={e=>setLanguage(e.target.value)} placeholder="en_US"/>
   <button type="button" className="tracker-btn" disabled={busy||!chosen||!providerName} onClick={()=>void approve()}>Record provider approval</button>
   <p className="composer-muted">The draft must be created with the chosen approved firm template before queueing; editing approval doesn't change the draft's selection.</p>
  </div>}
  {batch.batch.status==="draft"&&ready&&<div className="composer-send-box">
   <label>Send later (optional; local time)<input type="datetime-local" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></label>
   <button type="button" className="tracker-btn primary" disabled={disabled||busy} onClick={()=>void queue()}><Send size={14}/> Confirm and queue {batch.batch.recipient_count} messages</button>
   <p className="composer-muted">Delivery starts at least 30 seconds after confirmation and respects 21:00–08:00 IST quiet hours.</p>
  </div>}
  {batch.batch.status==="draft"&&!ready&&<p className="composer-muted">Automatic delivery is disabled until the firm's credentials and delivery flag are configured; manual drafts still work.</p>}
  {batch.batch.status==="queued"&&<div className="composer-send-box">
   <p className="composer-muted">Queued for {batch.batch.scheduled_at?new Date(batch.batch.scheduled_at).toLocaleString("en-IN"):"after confirmation"}.</p>
   <button type="button" className="tracker-btn" onClick={()=>void run(()=>undoQueuedBatch(batch.batch.id),"Queue cancelled before delivery.")} disabled={busy||disabled}><X size={13}/> Undo send (30 seconds)</button>
  </div>}
  <div className="composer-receipts">
   <h4>Message status ledger</h4>
   {batch.messages.map(item=><div key={item.id} className="composer-receipt-row">
    <div><strong>{item.client_name}</strong><small>{item.recipient}</small>
     {item.error&&<small className="composer-error">{item.error}</small>}</div>
    <span>{item.status==="delivered"||item.status==="read"?<CheckCircle2 size={13}/>:null}{item.status==="sent"?"Accepted by provider":item.status}</span>
    {item.status==="failed"&&<button type="button" className="tracker-btn" disabled={busy||disabled||!ready} onClick={()=>void run(()=>retryFailedMessage(batch.batch.id,item.id),"Failed message queued for reviewed retry.")}>Review and retry</button>}
   </div>)}
  </div>
 </section>;
}
