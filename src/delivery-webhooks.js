import {verifyMetaSignature} from "./delivery-provider.js";

const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const statusRank={sent:1,delivered:2,read:3};
const stopWords=new Set(["STOP","UNSUBSCRIBE","CANCEL","END","QUIT"]);
function normalizePhone(raw){return String(raw||"").replace(/\D/g,"")}
export async function handleWhatsAppWebhook(request,env){
 if(!env.WHATSAPP_FIRM_ID||!env.WHATSAPP_APP_SECRET||!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)return respond({error:"Webhook is not configured"},503);
 const url=new URL(request.url);
 if(request.method==="GET"){
  const mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token"),challenge=url.searchParams.get("hub.challenge");
  if(mode!=="subscribe"||token!==env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||!/^\d{1,30}$/.test(String(challenge||"")))return respond({error:"Verification failed"},403);
  return new Response(challenge,{headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
 }
 if(request.method!=="POST")return respond({error:"Method not allowed"},405);
 const length=Number(request.headers.get("Content-Length")||0);
 if(length>512000)return respond({error:"Webhook too large"},413);
 const raw=await request.text();
 if(raw.length>512000)return respond({error:"Webhook too large"},413);
 if(!await verifyMetaSignature(env.WHATSAPP_APP_SECRET,raw,request.headers.get("X-Hub-Signature-256")))return respond({error:"Invalid signature"},403);
 let body;try{body=JSON.parse(raw)}catch{return respond({error:"Invalid JSON"},400)}
 if(body.object!=="whatsapp_business_account"||!Array.isArray(body.entry))return respond({error:"Invalid WhatsApp event"},400);
 const db=env.DB,firm=env.WHATSAPP_FIRM_ID,at=new Date().toISOString();
 for(const entry of body.entry.slice(0,20)){
  for(const change of (Array.isArray(entry.changes)?entry.changes:[]).slice(0,20)){
   const value=change.value||{};
   const statuses=Array.isArray(value.statuses)?value.statuses:[];
   for(const record of statuses.slice(0,100)){
    const providerId=String(record.id||"");
    const state=String(record.status||"");
    if(!providerId||!["sent","delivered","read","failed"].includes(state))continue;
    const message=await db.prepare("SELECT id,status FROM messages WHERE firm_id=? AND channel='whatsapp' AND provider_id=?")
     .bind(firm,providerId).first();
    if(!message)continue;
    if(state==="failed"&&["delivered","read"].includes(message.status))continue;
    if(stateRank[state]&&statusRank[message.status]>=statusRank[state])continue;
    const details=state==="failed"?{code:record.errors?.[0]?.code||null}:{}; 
    try{
     await db.batch([
      db.prepare("UPDATE messages SET status=?,last_status_at=?,delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END,read_at=CASE WHEN ?='read' THEN ? ELSE read_at END,error=CASE WHEN ?='failed' THEN ? ELSE error END WHERE id=? AND firm_id=?")
       .bind(state,at,state,at,state,at,state,state==="failed"?"WhatsApp delivery failed":null,message.id,firm),
      db.prepare("INSERT OR IGNORE INTO delivery_events(id,firm_id,message_id,event_type,provider_event_id,detail,created_at) VALUES(?,?,?,?,?,?,?)")
       .bind(crypto.randomUUID(),firm,message.id,state,providerId+":"+String(record.timestamp||""),JSON.stringify(details),at)
     ]);
    }catch(e){console.error("Chamber WhatsApp webhook update error",e?.message)}
   }
   const incoming=Array.isArray(value.messages)?value.messages:[];
   for(const event of incoming.slice(0,100)){
    const providerId=String(event.id||"");
    const sender=normalizePhone(event.from);
    if(!providerId||!sender)continue;
    const duplicate=await db.prepare("SELECT id FROM inbound_messages WHERE firm_id=? AND channel='whatsapp' AND provider_message_id=?")
     .bind(firm,providerId).first();
    if(duplicate)continue;
    const text=typeof event.text?.body==="string"?event.text.body.slice(0,2000):null;
    const mediaId=String(event.image?.id||event.document?.id||event.audio?.id||"").slice(0,150)||null;
    const contacts=(await db.prepare("SELECT id,client_id,phone FROM client_contacts WHERE firm_id=? AND active=1 AND phone IS NOT NULL")
     .bind(firm).all()).results.filter(c=>normalizePhone(c.phone)===sender);
    // Unknown or ambiguous sender gets no client association, never cross-link by guessing.
    const matched=contacts.length===1?contacts[0]:null;
    const isStop=text&&stopWords.has(text.trim().toUpperCase());
    await db.batch([
     db.prepare("INSERT OR IGNORE INTO inbound_messages(id,firm_id,client_id,contact_id,channel,sender,provider_message_id,body,media_id,received_at) VALUES(?,?,?,?,'whatsapp',?,?,?,?,?)")
      .bind(crypto.randomUUID(),firm,matched?.client_id||null,matched?.id||null,sender,providerId,text,mediaId,at),
     db.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at,event_class) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),firm,null,isStop?"whatsapp_opt_out":"received_message","client",matched?.client_id||firm,JSON.stringify({linked:Boolean(matched),contains_media:Boolean(mediaId)}),at,"work")
    ]);
    if(isStop&&matched){
     await db.prepare("UPDATE client_contacts SET whatsapp_opt_in_at=NULL,whatsapp_opt_in_source=NULL,preferred_channel='email',updated_at=? WHERE firm_id=? AND id=?")
      .bind(at,firm,matched.id).run();
    }
   }
  }
 }
 return respond({ok:true});
}
