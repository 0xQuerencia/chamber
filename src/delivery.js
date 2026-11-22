import {providerReady,sendWithProvider,ProviderFailure,verifyMetaSignature} from "./delivery-provider.js";
import {canReadClient} from "./permissions.js";

const nowISO=()=>new Date().toISOString();
const plusMinutes=(minutes)=>new Date(Date.now()+minutes*60_000).toISOString();
function clockIST(){
 return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
}
function inQuietHours(clock,start,end){return start<=end?(clock>=start&&clock<end):(clock>=start||clock<end)}
function safeError(e){return e instanceof ProviderFailure?e.message:"Provider delivery error; review this message before retry"}
const holdUntil=(iso)=>Date.parse(iso)>Date.now();
const identifiers=/^[a-f0-9-]{36}$/;
function isPhoneMatch(a,b){return String(a||"").replace(/\D/g,"")===String(b||"").replace(/\D/g,"")}

/** All confirmed sends wait at least 30 seconds for undo. No automatic sending of drafts. */
export async function handleDelivery(request,env,user,deps){
 const {output,fail,clean,audit,iso,bodyJSON}=deps;
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(user.role!=="principal"&&user.role!=="manager")return fail("Only principals and managers can send messages",403);
 const b=path.match(/^\/api\/delivery\/batches\/([a-f0-9-]+)\/(queue|cancel|retry)$/);
 if(path==="/api/delivery/readiness"&&method==="GET"){
  return output({
   email:providerReady(env,"email",user.firm_id),
   whatsapp:providerReady(env,"whatsapp",user.firm_id),
   safety:{scheduled_undo_seconds:30,quiet_hours_ist:"21:00–08:00",template_approval_required:true}
  });
 }
 if(!b)return fail("Not found",404);
 const bid=b[1],action=b[2];
 const batch=await db.prepare("SELECT id,firm_id,channel,status,template_id,created_by,queued_at FROM message_batches WHERE firm_id=? AND id=? "+(user.role==="manager"?"AND created_by=?":""))
  .bind(...(user.role==="manager"?[user.firm_id,bid,user.id]:[user.firm_id,bid])).first();
 if(!batch)return fail("Batch not found",404);
 if(action==="queue"&&method==="POST"){
  if(batch.status!=="draft")return fail("Only draft batches can be queued",409);
  if(!providerReady(env,batch.channel,user.firm_id))return fail("Firm-owned "+batch.channel+" delivery is not configured",503);
  const data=await bodyJSON(request);
  const messages=(await db.prepare("SELECT * FROM messages WHERE firm_id=? AND batch_id=? AND status='draft' ORDER BY client_id")
   .bind(user.firm_id,bid).all()).results;
  if(!messages.length||messages.length>50)return fail("No valid draft recipients",409);
  if(!Number.isInteger(data.confirm_count)||data.confirm_count!==messages.length||data.confirm_names!=="CONFIRM")
   return fail("Confirm the exact recipient count and enter CONFIRM to schedule",409);
  let template=null;
  if(batch.channel==="whatsapp"){
   template=batch.template_id?await db.prepare("SELECT id,approval_status,provider_template_id,language_code FROM message_templates WHERE firm_id=? AND id=? AND channel='whatsapp' AND active=1").bind(user.firm_id,batch.template_id).first():null;
   if(!template||template.approval_status!=="approved"||!template.provider_template_id)return fail("WhatsApp requires a provider-approved template, not a custom message",409);
  }
  for(const msg of messages){
   if(!(await canReadClient(db,user,msg.client_id)))return fail("One or more clients are no longer accessible",409);
   const active=await db.prepare("SELECT id FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL").bind(user.firm_id,msg.client_id).first();
   if(!active)return fail("A client was archived. Create a new draft.",409);
   if(batch.channel==="whatsapp"){
    const consent=msg.contact_id?await db.prepare("SELECT id,phone FROM client_contacts WHERE firm_id=? AND id=? AND client_id=? AND active=1 AND whatsapp_opt_in_at IS NOT NULL AND whatsapp_opt_in_source IS NOT NULL")
     .bind(user.firm_id,msg.contact_id,msg.client_id).first():null;
    if(!consent||!isPhoneMatch(consent.phone,msg.recipient))return fail("WhatsApp consent or recipient changed. Recreate the draft.",409);
    if(!Array.isArray(JSON.parse(msg.template_params||"null")))return fail("WhatsApp template variables are missing",409);
   }else{
    const client=await db.prepare("SELECT email FROM clients WHERE firm_id=? AND id=?").bind(user.firm_id,msg.client_id).first();
    const contact=msg.contact_id?await db.prepare("SELECT email FROM client_contacts WHERE firm_id=? AND id=? AND client_id=? AND active=1").bind(user.firm_id,msg.contact_id,msg.client_id).first():null;
    if((contact?.email||client?.email||"").toLowerCase()!==msg.recipient.toLowerCase())return fail("Email recipient changed. Recreate draft.",409);
   }
  }
  let sendAt=plusMinutes(0.5);
  if(data.scheduled_at){
   const requested=Date.parse(String(data.scheduled_at));
   if(!Number.isFinite(requested)||requested<Date.now()+30_000||requested>Date.now()+30*86400000)return fail("Scheduled time must be 30 seconds to 30 days from now");
   sendAt=new Date(requested).toISOString();
  }
  const at=iso();
  await db.batch([
   db.prepare("UPDATE message_batches SET status='queued',queued_at=?,queued_by=?,scheduled_at=? WHERE firm_id=? AND id=? AND status='draft'")
    .bind(at,user.id,sendAt,user.firm_id,bid),
   db.prepare("UPDATE messages SET status='queued',next_attempt_at=?,last_status_at=? WHERE firm_id=? AND batch_id=? AND status='draft'")
    .bind(sendAt,at,user.firm_id,bid),
   await audit(db,user,"queued","message_batch",bid,{channel:batch.channel,recipient_count:messages.length,scheduled_at:sendAt})
  ]);
  return output({ok:true,status:"queued",send_after:sendAt,undo_until:new Date(Date.now()+30_000).toISOString(),count:messages.length});
 }
 if(action==="cancel"&&method==="POST"){
  if(batch.status!=="queued"||Date.now()-Date.parse(batch.queued_at)>30_000)return fail("The 30-second undo window has expired",409);
  const busy=await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE firm_id=? AND batch_id=? AND status NOT IN ('queued','cancelled')").bind(user.firm_id,bid).first();
  if(Number(busy.n))return fail("At least one message has already left the queue",409);
  await db.batch([
   db.prepare("UPDATE message_batches SET status='cancelled' WHERE firm_id=? AND id=? AND status='queued'").bind(user.firm_id,bid),
   db.prepare("UPDATE messages SET status='cancelled',next_attempt_at=NULL,lease_until=NULL,last_status_at=? WHERE firm_id=? AND batch_id=? AND status='queued'")
    .bind(iso(),user.firm_id,bid),
   await audit(db,user,"cancelled","message_batch",bid,{reason:"undo_send"})
  ]);
  return output({ok:true,undo:true});
 }
 if(action==="retry"&&method==="POST"){
  if(batch.status!=="queued"&&batch.status!=="completed")return fail("Batch was never scheduled",409);
  if(!providerReady(env,batch.channel,user.firm_id))return fail("Delivery integration is unavailable",503);
  const data=await bodyJSON(request),messageId=clean(data.message_id,100);
  if(!identifiers.test(messageId))return fail("Choose one failed message",400);
  const message=await db.prepare("SELECT id,status,client_id FROM messages WHERE firm_id=? AND batch_id=? AND id=?").bind(user.firm_id,bid,messageId).first();
  if(!message||message.status!=="failed"||!(await canReadClient(db,user,message.client_id)))return fail("Failed message not found",404);
  const at=iso(),scheduled=plusMinutes(.5);
  await db.batch([
   db.prepare("UPDATE messages SET status='queued',error=NULL,next_attempt_at=?,lease_until=NULL,last_status_at=?,send_attempts=0 WHERE firm_id=? AND id=? AND status='failed'")
    .bind(scheduled,at,user.firm_id,messageId),
   db.prepare("UPDATE message_batches SET status='queued' WHERE firm_id=? AND id=?").bind(user.firm_id,bid),
   await audit(db,user,"retry_requested","message",messageId)
  ]);
  return output({ok:true,status:"queued",send_after:scheduled});
 }
 return fail("Not found",404);
}

/** Lease, validate and send a small bounded queue slice in one cron tick. */
export async function drainDeliveryQueue(env,limit=15){
 if(!env.DB||String(env.CHAMBER_ALLOW_DELIVERY||"")!=="true")return {processed:0,disabled:true};
 const db=env.DB,at=nowISO(),processed={processed:0,sent:0,failed:0,retry:0,skipped:0};
 const rows=(await db.prepare("SELECT m.*,b.period,b.template_id,b.status AS batch_status,b.scheduled_at FROM messages m "+
  "JOIN message_batches b ON b.id=m.batch_id AND b.firm_id=m.firm_id "+
  "WHERE m.status='queued' AND b.status='queued' AND m.next_attempt_at<=? AND (m.lease_until IS NULL OR m.lease_until<?) "+
  "ORDER BY m.next_attempt_at,m.id LIMIT ?").bind(at,at,limit).all()).results;
 for(const row of rows){
  if(!providerReady(env,row.channel,row.firm_id)){processed.skipped++;continue}
  const rule=await db.prepare("SELECT quiet_start,quiet_end FROM reminder_rules WHERE firm_id=?").bind(row.firm_id).first();
  if(inQuietHours(clockIST(),rule?.quiet_start||"21:00",rule?.quiet_end||"08:00")){processed.skipped++;continue}
  const lease=plusMinutes(3);
  const claimed=await db.prepare("UPDATE messages SET lease_until=? WHERE firm_id=? AND id=? AND status='queued' AND (lease_until IS NULL OR lease_until<?)")
   .bind(lease,row.firm_id,row.id,at).run();
  if(Number(claimed.meta?.changes||0)!==1)continue;
  processed.processed++;
  const client=await db.prepare("SELECT id FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL").bind(row.firm_id,row.client_id).first();
  let allowed=Boolean(client);
  if(allowed&&row.channel==="whatsapp"){
   const consent=await db.prepare("SELECT phone FROM client_contacts WHERE firm_id=? AND id=? AND client_id=? AND active=1 AND whatsapp_opt_in_at IS NOT NULL")
    .bind(row.firm_id,row.contact_id,row.client_id).first();
   allowed=Boolean(consent&&isPhoneMatch(consent.phone,row.recipient));
  }
  if(!allowed){
   await db.prepare("UPDATE messages SET status='failed',error=?,lease_until=NULL,last_status_at=? WHERE id=? AND firm_id=?")
    .bind("Recipient invalid, archived or opted out",nowISO(),row.id,row.firm_id).run();
   processed.failed++;continue;
  }
  const template=row.channel==="whatsapp"?await db.prepare("SELECT approval_status,provider_template_id,language_code FROM message_templates WHERE firm_id=? AND id=? AND active=1")
   .bind(row.firm_id,row.template_id).first():null;
  try{
   const result=await sendWithProvider(env,row,template);
   await db.batch([
    db.prepare("UPDATE messages SET status='sent',provider_id=?,error=NULL,send_attempts=send_attempts+1,sent_at=?,last_status_at=?,next_attempt_at=NULL,lease_until=NULL WHERE id=? AND firm_id=? AND status='queued'")
     .bind(result.provider_id,result.accepted_at,result.accepted_at,row.id,row.firm_id),
    db.prepare("INSERT INTO delivery_events(id,firm_id,message_id,event_type,provider_event_id,detail,created_at) VALUES(?,?,?,?,?,?,?)")
     .bind(crypto.randomUUID(),row.firm_id,row.id,"accepted",result.provider_id,"{}",result.accepted_at),
    db.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at,event_class) VALUES(?,?,?,?,?,?,?,?,?)")
     .bind(crypto.randomUUID(),row.firm_id,null,"sent","message",row.id,JSON.stringify({channel:row.channel,provider:"accepted"}),result.accepted_at,"work")
   ]);
   processed.sent++;
  }catch(e){
   const retry=e instanceof ProviderFailure&&e.retryable&&row.send_attempts<4;
   const delay=retry?Math.min(240,2**(row.send_attempts+1)):0;
   await db.batch([
    db.prepare("UPDATE messages SET status=?,error=?,send_attempts=send_attempts+1,next_attempt_at=?,lease_until=NULL,last_status_at=? WHERE id=? AND firm_id=? AND status='queued'")
     .bind(retry?"queued":"failed",safeError(e),retry?plusMinutes(delay):null,nowISO(),row.id,row.firm_id),
    db.prepare("INSERT INTO delivery_events(id,firm_id,message_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)")
     .bind(crypto.randomUUID(),row.firm_id,row.id,retry?"retry_scheduled":"failed",JSON.stringify({reason:safeError(e)}),nowISO())
   ]);
   if(retry)processed.retry++;else processed.failed++;
  }
  const remaining=await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE firm_id=? AND batch_id=? AND status='queued'")
    .bind(row.firm_id,row.batch_id).first();
  if(!Number(remaining.n))await db.prepare("UPDATE message_batches SET status='completed' WHERE firm_id=? AND id=? AND status='queued'").bind(row.firm_id,row.batch_id).run();
 }
 return processed;
}
