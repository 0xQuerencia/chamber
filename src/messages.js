import {canReadClient,clientScope} from "./permissions.js";
// Draft-only communications. Never claims to send WhatsApp or email.
const DEFAULT_BODY="Dear {client},\n\nPlease provide the following documents for {month}:\n{missing_list}\n\nRequested by: {due}\n\nRegards,\nChamber";
const channels=new Set(["email","whatsapp"]);
export async function handleMessages(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail}=deps;
 if(!isPrivileged(user))return fail("Manager or principal permission required",403);
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 async function preview(data){
  const channel=clean(data.channel,20),period=clean(data.period,7),ids=data.client_ids;
  if(!channels.has(channel)||!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)||
    !Array.isArray(ids)||ids.length<1||ids.length>50||
    ids.some(x=>typeof x!=="string"||!/^[a-f0-9-]{36}$/.test(x))||new Set(ids).size!==ids.length)
    return {error:"Choose a month, channel and 1–50 unique clients"};
  let body=typeof data.body==="string"?data.body:DEFAULT_BODY;
  const templateId=clean(data.template_id,100);
  if(templateId){
   const t=await db.prepare("SELECT channel,body FROM message_templates WHERE firm_id=? AND id=? AND active=1")
    .bind(user.firm_id,templateId).first();
   if(!t||t.channel!==channel)return {error:"Invalid template for channel"};
   body=t.body;
  }
  if(body.length<10||body.length>2000)return {error:"Message body must contain 10–2000 characters"};
  const previews=[];
  for(const cid of ids){
   if(!(await canReadClient(db,user,cid))){
    previews.push({client_id:cid,client_name:"Unavailable",eligible:false,reason:"Client unavailable",recipient:null,contact_id:null,missing_count:0,body:""});continue;
   }
   const client=await db.prepare("SELECT id,name,email FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL")
    .bind(user.firm_id,cid).first();
   if(!client){previews.push({client_id:cid,client_name:"Unavailable",eligible:false,reason:"Client unavailable",recipient:null,contact_id:null,missing_count:0,body:""});continue}
   const missing=(await db.prepare("SELECT d.name,t.due_date,t.ask_by_date FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id WHERE d.firm_id=? AND t.client_id=? AND t.period=? AND t.status!='done' AND d.status NOT IN ('received','verified','not_applicable') ORDER BY d.name LIMIT 100")
    .bind(user.firm_id,cid,period).all()).results;
   if(!missing.length){
    previews.push({client_id:cid,client_name:client.name,eligible:false,reason:"No missing documents",recipient:null,contact_id:null,missing_count:0,body:""});continue;
   }
   const contact=channel==="whatsapp"?
    await db.prepare("SELECT id,phone FROM client_contacts WHERE firm_id=? AND client_id=? AND active=1 AND whatsapp_opt_in_at IS NOT NULL AND whatsapp_opt_in_source IS NOT NULL AND phone IS NOT NULL AND phone!='' ORDER BY created_at LIMIT 1").bind(user.firm_id,cid).first():
    await db.prepare("SELECT id,email FROM client_contacts WHERE firm_id=? AND client_id=? AND active=1 AND email IS NOT NULL AND email!='' AND preferred_channel='email' ORDER BY created_at LIMIT 1").bind(user.firm_id,cid).first();
   const recipient=channel==="whatsapp"?contact?.phone??null:contact?.email??client.email??null;
   if(!recipient||(channel==="email"&&!validEmail(recipient))||(channel==="whatsapp"&&!/^\+?[0-9 ()-]{6,24}$/.test(recipient))){
    previews.push({client_id:cid,client_name:client.name,eligible:false,reason:channel==="whatsapp"?"No opted-in WhatsApp contact":"No valid email address",recipient:null,contact_id:null,missing_count:missing.length,body:""});continue;
   }
   const earliest=missing.map(x=>x.ask_by_date||x.due_date).filter(Boolean).sort()[0]||"As soon as possible";
   const unique=[...new Set(missing.map(x=>x.name))];
   const values={client:client.name,month:period,missing_list:unique.map((x,i)=>(i+1)+". "+x).join("\n"),due:earliest};
   const text=body.replace(/\{(client|month|missing_list|due)\}/g,(_,key)=>values[key]??"");
   previews.push({client_id:cid,client_name:client.name,eligible:true,reason:null,recipient,contact_id:contact?.id??null,missing_count:missing.length,body:text});
  }
  return {channel,period,previews,eligible:previews.filter(p=>p.eligible).length,skipped:previews.filter(p=>!p.eligible).length};
 }

 if(path==="/api/messages/templates"&&method==="GET"){
  const templates=(await db.prepare("SELECT id,name,channel,category,body,approval_status,active FROM message_templates WHERE firm_id=? ORDER BY name").bind(user.firm_id).all()).results;
  return output({templates});
 }
 if(path==="/api/messages/templates"&&method==="POST"){
  if(user.role!=="principal")return fail("Only principal can change firm-wide message templates",403);
  const data=await bodyJSON(request),name=clean(data.name,100),channel=clean(data.channel,20),body=String(data.body||"");
  if(!name||!channels.has(channel)||body.length<10||body.length>2000)return fail("Template name, channel and 10–2000 character body required");
  const at=iso(),tid=id();
  await db.batch([
   db.prepare("INSERT INTO message_templates(id,firm_id,name,channel,body,created_at) VALUES(?,?,?,?,?,?)")
    .bind(tid,user.firm_id,name,channel,body,at),
   await audit(db,user,"created","message_template",tid,{channel})
  ]);
  return output({id:tid},201);
 }

 if(path==="/api/messages/preview"&&method==="POST"){
  const result=await preview(await bodyJSON(request));
  return result.error?fail(result.error):output(result);
 }

 if(path==="/api/messages/batches"&&method==="POST"){
  const data=await bodyJSON(request),result=await preview(data);
  if(result.error)return fail(result.error);
  if(!result.eligible)return fail("No eligible recipients",409);
  if(!Number.isInteger(data.confirm_count)||data.confirm_count!==result.eligible)
   return fail("Confirmed recipient count differs from latest preview",409);
  const at=iso(),bid=id(),entries=result.previews.filter(p=>p.eligible);
  await db.batch([
   db.prepare("INSERT INTO message_batches(id,firm_id,created_by,channel,period,status,recipient_count,created_at) VALUES(?,?,?,?,?,'draft',?,?)")
    .bind(bid,user.firm_id,user.id,result.channel,result.period,entries.length,at),
   ...entries.map(p=>db.prepare("INSERT INTO messages(id,firm_id,batch_id,client_id,contact_id,channel,recipient,body,status,created_at,last_status_at) VALUES(?,?,?,?,?,?,?,?,'draft',?,?)")
    .bind(id(),user.firm_id,bid,p.client_id,p.contact_id,result.channel,p.recipient,p.body,at,at)),
   await audit(db,user,"drafted","message_batch",bid,{channel:result.channel,recipient_count:entries.length,period:result.period})
  ]);
  return output({id:bid,status:"draft",recipient_count:entries.length,skipped:result.skipped,delivery_enabled:false},201);
 }

 if(path==="/api/messages/batches"&&method==="GET"){
  const mine=user.role==="manager";
  const batches=(await db.prepare("SELECT id,channel,period,status,recipient_count,created_at FROM message_batches WHERE firm_id=? "+(mine?"AND created_by=? ":"")+"ORDER BY created_at DESC LIMIT 30")
   .bind(...(mine?[user.firm_id,user.id]:[user.firm_id])).all()).results;
  return output({batches,delivery_enabled:false});
 }
 const match=path.match(/^\/api\/messages\/batches\/([a-f0-9-]+)(?:\/cancel)?$/);
 if(match){
  const batch=await db.prepare("SELECT id,channel,period,status,recipient_count FROM message_batches WHERE firm_id=? AND id=? "+(user.role==="manager"?"AND created_by=?":""))
   .bind(...(user.role==="manager"?[user.firm_id,match[1],user.id]:[user.firm_id,match[1]])).first();
  if(!batch)return fail("Batch not found",404);
  if(path.endsWith("/cancel")&&method==="POST"){
   if(batch.status!=="draft")return fail("Only draft batches can be cancelled",409);
   await db.batch([
    db.prepare("UPDATE message_batches SET status='cancelled' WHERE firm_id=? AND id=?").bind(user.firm_id,batch.id),
    db.prepare("UPDATE messages SET status='cancelled',last_status_at=? WHERE firm_id=? AND batch_id=? AND status='draft'").bind(iso(),user.firm_id,batch.id),
    await audit(db,user,"cancelled","message_batch",batch.id)
   ]);
   return output({ok:true});
  }
  if(!path.endsWith("/cancel")&&method==="GET"){
   const scope=clientScope(user,"c");
   const messages=(await db.prepare("SELECT m.id,m.client_id,c.name AS client_name,m.contact_id,m.recipient,m.body,m.status,m.error FROM messages m JOIN clients c ON c.id=m.client_id AND c.firm_id=m.firm_id WHERE m.firm_id=? AND m.batch_id=? AND "+scope.sql+" ORDER BY c.name")
    .bind(user.firm_id,batch.id,...scope.args).all()).results;
   return output({batch,messages,delivery_enabled:false});
  }
 }
 return fail("Not found",404);
}
