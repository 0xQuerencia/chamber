// Append-only work activity mirror. The D1 audit log remains authoritative.
// Deduplication rechecks remote event IDs before appending to avoid retries
// generating duplicate rows after an interrupted network response.
const SCOPE="https://www.googleapis.com/auth/spreadsheets";
const GRANT="urn:ietf:params:oauth:grant-type:jwt-bearer";
const WORK_EVENTS=new Set(["created","updated","received","enrolled","generated","system_generated",
 "assigned","approved","returned","commented","drafted","cancelled","overrode","archived",
 "imported","completed","undone","started_timer","stopped_timer"]);
function b64url(data){
 const bytes=typeof data==="string"?new TextEncoder().encode(data):new Uint8Array(data);
 let text="";for(const x of bytes)text+=String.fromCharCode(x);
 return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function cleanReason(message){
 return String(message||"Integration error").replace(/[A-Za-z0-9_-]{40,}/g,"[redacted]").slice(0,250);
}
async function serviceToken(json){
 const info=JSON.parse(json);
 if(!info.client_email||!info.private_key)throw Error("Invalid Sheets service-account configuration");
 const keyBytes=Uint8Array.from(atob(info.private_key.replace(/-----[^-]+-----/g,"").replace(/\s+/g,"")),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",keyBytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const claim=b64url(JSON.stringify({iss:info.client_email,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3000}));
 const source=header+"."+claim;
 const signature=b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(source)));
 const form=new URLSearchParams({grant_type:GRANT,assertion:source+"."+signature});
 const result=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
 if(!result.ok)throw Error("Google authorization rejected");
 const token=await result.json();
 if(!token.access_token)throw Error("Google did not return an access token");
 return token.access_token;
}
async function sheets(token,method,path,body){
 const response=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+path,{
  method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined
 });
 if(!response.ok)throw Error("Sheets API request failed ("+response.status+")");
 return response.json();
}
function tabFor(value){return new Date(value).toISOString().slice(0,7)}
async function ensureTab(token,id,tab){
 const meta=await sheets(token,"GET",encodeURIComponent(id)+"?fields=sheets.properties.title");
 if(meta.sheets?.some(s=>s.properties?.title===tab))return;
 await sheets(token,"POST",encodeURIComponent(id)+":batchUpdate",{requests:[{addSheet:{properties:{title:tab}}}]});
 await sheets(token,"PUT",encodeURIComponent(id)+"/values/"+encodeURIComponent("'"+tab+"'!A1:F1")+"?valueInputOption=RAW",
 {range:"'"+tab+"'!A1:F1",majorDimension:"ROWS",values:[["Timestamp (IST)","User","Client code","Action","Detail","Event ID"]]});
}
async function existingIds(token,id,tab){
 const data=await sheets(token,"GET",encodeURIComponent(id)+"/values/"+encodeURIComponent("'"+tab+"'!F2:F"));
 return new Set((data.values||[]).map(row=>row[0]).filter(Boolean));
}
function ist(value){return new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})}
async function syncFirm(env,firm,token){
 const db=env.DB,now=new Date().toISOString();
 const lockedUntil=new Date(Date.now()+180000).toISOString();
 await db.prepare("INSERT OR IGNORE INTO sheet_sync_locks(firm_id,locked_until) VALUES(?,NULL)").bind(firm.firm_id).run();
 const lock=await db.prepare("UPDATE sheet_sync_locks SET locked_until=? WHERE firm_id=? AND (locked_until IS NULL OR locked_until<?)")
  .bind(lockedUntil,firm.firm_id,now).run();
 if(Number(lock.meta?.changes||0)<1)return {busy:true};
 try{
  const all=(await db.prepare("SELECT a.id,a.at,a.event,a.entity_type,a.entity_id,u.name AS actor_name,"+
   "CASE WHEN a.entity_type='client' THEN (SELECT c.code FROM clients c WHERE c.id=a.entity_id AND c.firm_id=a.firm_id) "+
   "WHEN a.entity_type='task' THEN (SELECT c.code FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id WHERE t.id=a.entity_id AND t.firm_id=a.firm_id) "+
   "WHEN a.entity_type='document' THEN (SELECT c.code FROM documents d JOIN clients c ON c.id=d.client_id AND c.firm_id=d.firm_id WHERE d.id=a.entity_id AND d.firm_id=a.firm_id) "+
   "ELSE NULL END AS client_code "+
   "FROM activity a LEFT JOIN users u ON u.id=a.actor_id AND u.firm_id=a.firm_id WHERE a.firm_id=? AND a.sheet_synced_at IS NULL ORDER BY a.at,a.id LIMIT 150")
   .bind(firm.firm_id).all()).results;
  if(!all.length){
   await db.prepare("UPDATE sheet_connections SET last_synced_at=?,last_error=NULL WHERE firm_id=?").bind(now,firm.firm_id).run();
   return {synced:0};
  }
  const groups=new Map();
  for(const event of all){
   const tab=tabFor(event.at);
   if(!groups.has(tab))groups.set(tab,[]);
   groups.get(tab).push(event);
  }
  const done=[];
  for(const [tab,events] of groups){
   await ensureTab(token,firm.spreadsheet_id,tab);
   const existing=await existingIds(token,firm.spreadsheet_id,tab);
   const additions=events.filter(event=>WORK_EVENTS.has(event.event)&&!existing.has(event.id));
   if(additions.length){
    const rows=additions.map(e=>[ist(e.at),e.actor_name||"Automation",e.client_code||"",e.event,
      e.entity_type+" — "+e.event,e.id]);
    await sheets(token,"POST",encodeURIComponent(firm.spreadsheet_id)+"/values/"+encodeURIComponent("'"+tab+"'!A:F")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      {range:"'"+tab+"'!A:F",majorDimension:"ROWS",values:rows});
   }
   done.push(...events);
  }
  const statements=done.map(e=>db.prepare("UPDATE activity SET sheet_synced_at=? WHERE firm_id=? AND id=?").bind(now,firm.firm_id,e.id));
  statements.push(db.prepare("UPDATE sheet_connections SET last_synced_at=?,last_error=NULL WHERE firm_id=?").bind(now,firm.firm_id));
  await db.batch(statements);
  return {synced:done.length};
 }catch(error){
  await db.prepare("UPDATE sheet_connections SET last_error=? WHERE firm_id=?").bind(cleanReason(error?.message),firm.firm_id).run();
  throw error;
 }finally{
  await db.prepare("UPDATE sheet_sync_locks SET locked_until=NULL WHERE firm_id=?").bind(firm.firm_id).run();
 }
}
export async function scheduledSheetSync(env){
 if(!env.DB||!env.GOOGLE_SERVICE_ACCOUNT_JSON)return;
 const connected=(await env.DB.prepare("SELECT firm_id,spreadsheet_id FROM sheet_connections WHERE enabled=1 LIMIT 100").all()).results;
 if(!connected.length)return;
 const token=await serviceToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
 for(const firm of connected){
  try{await syncFirm(env,firm,token)}
  catch(error){console.error("Chamber Sheets sync error for firm",firm.firm_id,cleanReason(error?.message))}
 }
}
export async function handleSheetSettings(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,bodyJSON}=deps;
 if(user.role!=="principal")return fail("Principal permission required",403);
 const db=env.DB,path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/sheets/status"&&method==="GET"){
  const item=await db.prepare("SELECT spreadsheet_id,enabled,last_synced_at,last_error FROM sheet_connections WHERE firm_id=?").bind(user.firm_id).first();
  return output({connected:Boolean(item?.enabled),spreadsheet_id:item?.spreadsheet_id??null,last_synced_at:item?.last_synced_at??null,
   last_error:item?.last_error??null,credentials_configured:Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON)});
 }
 if(path==="/api/sheets/connect"&&method==="POST"){
  const data=await bodyJSON(request),sheet=clean(data.spreadsheet_id,120);
  if(!/^[A-Za-z0-9_-]{15,120}$/.test(sheet))return fail("Valid Google spreadsheet ID required");
  const at=iso();
  await db.batch([
   db.prepare("INSERT INTO sheet_connections(firm_id,spreadsheet_id,enabled,created_at,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(firm_id) DO UPDATE SET spreadsheet_id=excluded.spreadsheet_id,enabled=1,updated_at=excluded.updated_at,last_synced_at=NULL,last_error=NULL")
    .bind(user.firm_id,sheet,at,at),
   await audit(db,user,"configured","sheets",user.firm_id)
  ]);
  return output({ok:true});
 }
 if(path==="/api/sheets/disconnect"&&method==="POST"){
  await db.batch([
   db.prepare("UPDATE sheet_connections SET enabled=0,updated_at=? WHERE firm_id=?").bind(iso(),user.firm_id),
   await audit(db,user,"disconnected","sheets",user.firm_id)
  ]);
  return output({ok:true});
 }
 return fail("Not found",404);
}
