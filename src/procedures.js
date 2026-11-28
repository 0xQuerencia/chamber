import {canReadClient} from "./permissions.js";

export function normalizeProcedureBody(value){
 if(typeof value!=="string")return null;
 const body=value.replace(/\r\n?/g,"\n").trim();
 if(!body||body.length>10000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body))return null;
 return body;
}
export async function handleProcedures(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,bodyJSON}=deps;
 const db=env.DB,url=new URL(request.url),firm=user.firm_id;
 const taskMatch=url.pathname.match(/^\/api\/procedures\/task\/([a-f0-9-]+)$/);
 if(taskMatch&&request.method==="GET"){
  const t=await db.prepare("SELECT id,client_id,service,assignee_id,reviewer_id FROM tasks WHERE firm_id=? AND id=?").bind(firm,taskMatch[1]).first();
  if(!t||!(await canReadClient(db,user,t.client_id)))return fail("Assignment not found",404);
  if(user.role==="staff"&&t.assignee_id!==user.id&&t.reviewer_id!==user.id)return fail("Assignment not found",404);
  const procedure=await db.prepare("SELECT id,service,version,title,body,published_at FROM firm_procedures WHERE firm_id=? AND service=? ORDER BY version DESC LIMIT 1").bind(firm,t.service).first();
  return output({procedure:procedure||null});
 }
 if(url.pathname!=="/api/procedures")return fail("Not found",404);
 if(user.role!=="principal")return fail("Principal permission required",403);
 if(request.method==="GET"){
  const service=clean(url.searchParams.get("service"),80);
  if(!service)return fail("Select a service");
  const versions=(await db.prepare("SELECT id,service,version,title,body,published_at FROM firm_procedures WHERE firm_id=? AND service=? ORDER BY version DESC LIMIT 20").bind(firm,service).all()).results;
  return output({versions});
 }
 if(request.method==="POST"){
  const data=await bodyJSON(request),service=clean(data.service,80),title=clean(data.title,140),body=normalizeProcedureBody(data.body);
  if(!service||!title||!body)return fail("Service, title and plain-text instructions (up to 10,000 characters) required");
  const known=await db.prepare("SELECT service FROM service_templates WHERE firm_id=? AND service=? UNION SELECT service FROM tasks WHERE firm_id=? AND service=? LIMIT 1").bind(firm,service,firm,service).first();
  if(!known)return fail("Choose an existing firm service");
  const latest=await db.prepare("SELECT MAX(version) AS version FROM firm_procedures WHERE firm_id=? AND service=?").bind(firm,service).first();
  const version=Number(latest?.version||0)+1,procedureId=id(),at=iso();
  try{
   await db.batch([
    db.prepare("INSERT INTO firm_procedures(id,firm_id,service,version,title,body,published_by,published_at) VALUES(?,?,?,?,?,?,?,?)").bind(procedureId,firm,service,version,title,body,user.id,at),
    await audit(db,user,"published","firm_procedure",procedureId,{service,version})
   ]);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("Another revision was published. Refresh and try again.",409);throw e;}
  return output({id:procedureId,version},201);
 }
 return fail("Not found",404);
}
