import {canReadClient} from "./permissions.js";
import {providerReady,sendPortalOtp} from "./delivery-provider.js";
import {makePortalToken,digestPortalToken,createSixDigitCode,otpDigest,constantMatch,portalHex} from "./portal-crypto.js";

const iso=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const validId=/^[a-f0-9-]{36}$/;
const validPeriod=/^20\d\d-(0[1-9]|1[0-2])$/;
const allowed={
 "application/pdf":/\.pdf$/i,"image/jpeg":/\.(jpg|jpeg)$/i,"image/png":/\.png$/i,
 "text/csv":/\.csv$/i,
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":/\.xlsx$/i
};
const MAX_BYTES=15*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const fail=(message,status=400)=>json({error:message},status);
const emailRegex=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const later=(m)=>new Date(Date.now()+m*60000).toISOString();
function canVerify(env,firm){return Boolean(env.PORTAL_OTP_PEPPER&&String(env.PORTAL_OTP_PEPPER).length>=32&&providerReady(env,"email",firm)&&env.FILES)}
function filename(value){
 try{return decodeURIComponent(String(value||"")).replace(/[\u0000-\u001f\u007f/\\]/g,"_").trim().slice(0,150)}
 catch{return ""}
}
async function readSmallJson(request){
 if(!(request.headers.get("Content-Type")||"").includes("application/json"))throw Error("JSON required");
 if(Number(request.headers.get("Content-Length")||0)>8192)throw Error("Request too large");
 const raw=await request.text();if(raw.length>8192)throw Error("Request too large");
 const data=JSON.parse(raw);if(!data||Array.isArray(data)||typeof data!=="object")throw Error("Expected object");
 return data;
}
async function activeLink(db,raw){
 const tokenHash=await digestPortalToken(raw);
 if(!tokenHash)return null;
 return db.prepare("SELECT p.id,p.firm_id,p.client_id,p.period,p.contact_id,p.recipient_email,p.expires_at,c.otp_hash,c.otp_expires_at,c.attempts,c.send_count,c.send_window_start,c.last_sent_at,c.access_hash,c.access_expires_at FROM portal_links p "+
  "JOIN portal_challenges c ON c.link_id=p.id WHERE p.token_hash=? AND p.expires_at>? AND p.revoked_at IS NULL")
  .bind(tokenHash,iso()).first();
}
async function authorizedLink(db,link,access){
 if(!link||typeof access!=="string")return false;
 const proof=await digestPortalToken(access);
 return Boolean(proof&&link.access_hash&&link.access_expires_at>iso()&&constantMatch(proof,link.access_hash));
}
export async function handlePortalLinks(request,env,user,deps){
 const {output,fail:apiFail,clean,audit,bodyJSON}=deps;
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(!["principal","manager"].includes(user.role))return apiFail("Only a principal or manager may create client upload links",403);
 if(path==="/api/portal/links"&&method==="GET"){
  const cid=clean(url.searchParams.get("client_id"),100);
  if(!validId.test(cid)||!(await canReadClient(db,user,cid)))return apiFail("Client not found",404);
  const rows=(await db.prepare("SELECT id,period,recipient_email,created_at,expires_at,revoked_at FROM portal_links WHERE firm_id=? AND client_id=? ORDER BY created_at DESC LIMIT 40")
   .bind(user.firm_id,cid).all()).results;
  return output({links:rows});
 }
 if(path==="/api/portal/links"&&method==="POST"){
  if(!canVerify(env,user.firm_id))return apiFail("Portal requires private R2 storage and firm-owned Gmail OTP credentials",503);
  const data=await bodyJSON(request),cid=clean(data.client_id,100),period=clean(data.period,7);
  const contactId=clean(data.contact_id,100),days=Number(data.expires_days??7);
  if(!validId.test(cid)||!validPeriod.test(period)||!Number.isInteger(days)||days<1||days>14||!(await canReadClient(db,user,cid)))
   return apiFail("Select an accessible client, valid month and 1–14 day expiry");
  const client=await db.prepare("SELECT id,name,email FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL")
   .bind(user.firm_id,cid).first();
  if(!client)return apiFail("Client not found",404);
  let recipient=client.email,contact=null;
  if(contactId){
   contact=await db.prepare("SELECT id,email FROM client_contacts WHERE firm_id=? AND client_id=? AND id=? AND active=1")
    .bind(user.firm_id,cid,contactId).first();
   recipient=contact?.email;
  }
  if(!emailRegex.test(String(recipient||"")))return apiFail("This client needs a verified recipient email before a portal link can be issued",409);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id WHERE d.firm_id=? AND d.client_id=? AND t.period=? AND t.status!='done'")
   .bind(user.firm_id,cid,period).first();
  if(!Number(count.n))return apiFail("No open document checklist exists for this client and period",409);
  const token=makePortalToken(),linkId=id(),at=iso(),expiry=later(days*1440);
  await db.batch([
   db.prepare("INSERT INTO portal_links(id,firm_id,client_id,period,contact_id,recipient_email,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(linkId,user.firm_id,cid,period,contact?.id||null,recipient.toLowerCase(),await digestPortalToken(token),user.id,at,expiry),
   db.prepare("INSERT INTO portal_challenges(link_id) VALUES(?)").bind(linkId),
   await audit(db,user,"created","portal_link",linkId,{client_id:cid,period,expires_at:expiry})
  ]);
  const origin=url.origin;
  return output({id:linkId,expires_at:expiry,recipient_email:recipient,
   url:origin+"/#/portal/"+token,warning:"Share privately. The registered recipient must pass email OTP before seeing documents."},201);
 }
 const hit=path.match(/^\/api\/portal\/links\/([a-f0-9-]+)\/revoke$/);
 if(hit&&method==="POST"){
  const link=await db.prepare("SELECT id,client_id,revoked_at FROM portal_links WHERE firm_id=? AND id=?").bind(user.firm_id,hit[1]).first();
  if(!link||!(await canReadClient(db,user,link.client_id)))return apiFail("Link not found",404);
  if(link.revoked_at)return apiFail("Link already revoked",409);
  await db.batch([
   db.prepare("UPDATE portal_links SET revoked_at=? WHERE id=? AND firm_id=?").bind(iso(),link.id,user.firm_id),
   db.prepare("DELETE FROM portal_challenges WHERE link_id=?").bind(link.id),
   await audit(db,user,"revoked","portal_link",link.id)
  ]);
  return output({ok:true});
 }
 return apiFail("Not found",404);
}
export async function handlePublicPortal(request,env){
 if(request.method!=="POST")return fail("Use POST",405);
 if(request.headers.get("Origin")!==new URL(request.url).origin)return fail("Invalid origin",403);
 if(!env.DB)return fail("Portal unavailable",503);
 const db=env.DB,path=new URL(request.url).pathname;
 if(path==="/api/portal/start"){
  let data;try{data=await readSmallJson(request)}catch{return fail("Invalid request")}
  const link=await activeLink(db,data.token);
  if(!link)return json({ok:true,notice:"If the link is valid, verification instructions will be sent."},202);
  if(!canVerify(env,link.firm_id))return fail("Client portal verification is not configured",503);
  const minute=60000,now=Date.now(),windowStart=Date.parse(link.send_window_start||"");
  const inWindow=Number.isFinite(windowStart)&&now-windowStart<60*minute;
  const count=inWindow?Number(link.send_count):0;
  if(count>=3||now-Date.parse(link.last_sent_at||"")<minute)return fail("Wait before requesting another code",429);
  const code=createSixDigitCode(),otpHash=await otpDigest(env.PORTAL_OTP_PEPPER,link.id,code),at=iso();
  const result=await db.prepare("UPDATE portal_challenges SET otp_hash=?,issued_at=?,otp_expires_at=?,attempts=0,send_count=?,send_window_start=?,last_sent_at=?,access_hash=NULL,access_expires_at=NULL "+
   "WHERE link_id=? AND (last_sent_at IS NULL OR last_sent_at<?)")
   .bind(otpHash,at,later(5),count+1,inWindow?link.send_window_start:at,at,link.id,new Date(now-minute).toISOString()).run();
  if(Number(result.meta?.changes||0)!==1)return fail("Try again later",429);
  try{await sendPortalOtp(env,link.firm_id,link.recipient_email,code)}
  catch(e){
   await db.prepare("UPDATE portal_challenges SET otp_hash=NULL,otp_expires_at=NULL WHERE link_id=?").bind(link.id).run();
   return fail("Unable to send verification email. Ask the firm to check its mailbox integration.",503);
  }
  return json({ok:true,notice:"A verification code has been sent to the client's registered email."});
 }
 if(path==="/api/portal/verify"){
  let data;try{data=await readSmallJson(request)}catch{return fail("Invalid request")}
  const link=await activeLink(db,data.token);
  if(!link||!link.otp_hash||!link.otp_expires_at||link.otp_expires_at<=iso()||link.attempts>=5)
   return fail("Invalid or expired verification challenge",401);
  const updated=await db.prepare("UPDATE portal_challenges SET attempts=attempts+1 WHERE link_id=? AND attempts<5 AND otp_expires_at>?")
   .bind(link.id,iso()).run();
  if(Number(updated.meta?.changes||0)!==1)return fail("Too many verification attempts",429);
  const hash=await otpDigest(env.PORTAL_OTP_PEPPER,link.id,data.code);
  if(!hash||!constantMatch(hash,link.otp_hash))return fail("Verification code was incorrect",401);
  const access=makePortalToken(),at=iso();
  await db.prepare("UPDATE portal_challenges SET otp_hash=NULL,otp_expires_at=NULL,access_hash=?,access_expires_at=? WHERE link_id=?")
   .bind(await digestPortalToken(access),later(15),link.id).run();
  return json({ok:true,access_token:access,expires_in_seconds:900});
 }
 const rawLink=request.headers.get("X-Portal-Link")||"",access=request.headers.get("X-Portal-Access")||"";
 const link=await activeLink(db,rawLink);
 if(!await authorizedLink(db,link,access))return fail("Verify your email again to access this checklist",401);
 if(path==="/api/portal/checklist"){
  const client=await db.prepare("SELECT id,name FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL").bind(link.firm_id,link.client_id).first();
  if(!client)return fail("Client is unavailable",404);
  const records=(await db.prepare("SELECT d.id,d.name,d.status,d.received_at FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id "+
   "WHERE d.firm_id=? AND d.client_id=? AND t.period=? AND t.status!='done' ORDER BY d.name LIMIT 100")
   .bind(link.firm_id,link.client_id,link.period).all()).results;
  return json({client_name:client.name,period:link.period,requirements:records,upload_limit_bytes:MAX_BYTES,
   notice:"Submitted files are quarantined until malware scanning completes; do not regard an upload as verified receipt."});
 }
 if(path==="/api/portal/upload"){
  if(!env.FILES)return fail("Private storage unavailable",503);
  const reqId=new URL(request.url).searchParams.get("requirement_id")||"";
  if(!validId.test(reqId))return fail("Choose a document from this checklist",400);
  const item=await db.prepare("SELECT d.id,d.name,d.client_id,d.task_id,d.status,t.assignee_id FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id WHERE d.firm_id=? AND d.client_id=? AND d.id=? AND t.period=? AND t.status!='done'")
   .bind(link.firm_id,link.client_id,reqId,link.period).first();
  if(!item)return fail("Checklist item unavailable",404);
  if(["verified","not_applicable"].includes(item.status))return fail("This item is already complete",409);
  const mime=(request.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase(),fileName=filename(request.headers.get("X-File-Name"));
  if(!allowed[mime]||!fileName||!allowed[mime].test(fileName))return fail("Upload PDF, JPEG, PNG, CSV or XLSX only",400);
  if(Number(request.headers.get("Content-Length")||0)>MAX_BYTES)return fail("File exceeds 15 MB",413);
  const reader=request.body?.getReader();if(!reader)return fail("File is empty",400);
  const chunks=[];let length=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>MAX_BYTES){await reader.cancel();return fail("File exceeds 15 MB",413)}
   chunks.push(value);
  }
  if(!length)return fail("File is empty",400);
  const bytes=new Uint8Array(length);let position=0;
  for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength}
  const checksum=portalHex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
  const fileId=id(),at=iso(),key=link.firm_id+"/"+item.id+"/"+fileId;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:"application/octet-stream"},customMetadata:{sha256:checksum}});
  try{
   const statements=[
    db.prepare("INSERT INTO stored_documents(id,firm_id,client_id,task_id,requirement_id,storage_key,filename,mime_type,size_bytes,sha256,scan_status,uploaded_by,uploaded_via,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',NULL,'portal',?)")
     .bind(fileId,link.firm_id,link.client_id,item.task_id,item.id,key,fileName,mime,length,checksum,at),
    db.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at,event_class) VALUES(?,?,?,?,?,?,?,?,?)")
     .bind(id(),link.firm_id,null,"client_uploaded","stored_document",fileId,JSON.stringify({requirement_id:item.id,via:"portal",status:"pending"}),at,"work")
   ];
   if(item.assignee_id)statements.push(db.prepare("INSERT INTO portal_notifications(id,firm_id,client_id,task_id,recipient_id,file_id,message,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id(),link.firm_id,link.client_id,item.task_id,item.assignee_id,fileId,"A client uploaded a file awaiting security scan",at));
   await db.batch(statements);
  }catch(e){await env.FILES.delete(key);throw e}
  return json({ok:true,id:fileId,status:"pending",message:"Upload received. It is quarantined until the file scan completes."},201);
 }
 return fail("Not found",404);
}
export async function handlePortalNotifications(request,env,user,deps){
 const {output,fail:apiFail,audit}=deps,db=env.DB,url=new URL(request.url);
 if(url.pathname==="/api/notifications"&&request.method==="GET"){
  const rows=(await db.prepare("SELECT id,client_id,task_id,message,created_at,read_at FROM portal_notifications WHERE firm_id=? AND recipient_id=? ORDER BY created_at DESC LIMIT 100")
   .bind(user.firm_id,user.id).all()).results;
  return output({notifications:rows});
 }
 const m=url.pathname.match(/^\/api\/notifications\/([a-f0-9-]+)\/read$/);
 if(m&&request.method==="POST"){
  const row=await db.prepare("SELECT id FROM portal_notifications WHERE firm_id=? AND recipient_id=? AND id=?")
   .bind(user.firm_id,user.id,m[1]).first();
  if(!row)return apiFail("Notification not found",404);
  await db.batch([
   db.prepare("UPDATE portal_notifications SET read_at=? WHERE firm_id=? AND recipient_id=? AND id=?").bind(iso(),user.firm_id,user.id,m[1]),
   await audit(db,user,"read","notification",m[1])
  ]);
  return output({ok:true});
 }
 return apiFail("Not found",404);
}
