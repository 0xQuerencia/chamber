import {clientScope,canReadClient} from "./permissions.js";
import {validCalendarDate} from "./domain.js";

const kinds=new Set(["return","challan","acknowledgement","certificate","other"]);
function indiaDate(now){return new Date(now.getTime()+19800000).toISOString().slice(0,10);}
export function validateFiling(data,clean,now=new Date()){
 const kind=typeof data.kind==="string"?data.kind:"";
 const reference=clean(data.reference,180),filed_on=clean(data.filed_on,10);
 const evidence_location=clean(data.evidence_location,300),note=clean(data.note,500);
 if(!kinds.has(kind)||!reference||!evidence_location||!validCalendarDate(filed_on)||filed_on>indiaDate(now))return null;
 return {kind,reference,filed_on,evidence_location,note};
}
export async function handleFilings(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,bodyJSON}=deps;
 if(user.role!=="principal"&&user.role!=="manager")return fail("Principal or manager permission required",403);
 const db=env.DB,url=new URL(request.url),scope=clientScope(user,"c"),firm=user.firm_id;
 if(url.pathname==="/api/filings"&&request.method==="GET"){
  const search=clean(url.searchParams.get("q"),120);
  const raw=Number(url.searchParams.get("page")||0),page=Number.isSafeInteger(raw)?Math.max(0,Math.min(raw,10000)):0;
  const filter=url.searchParams.get("filter")==="unrecorded"?" AND NOT EXISTS(SELECT 1 FROM filing_evidence f WHERE f.firm_id=t.firm_id AND f.task_id=t.id)":"";
  const query=" FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id WHERE t.firm_id=? AND c.archived_at IS NULL AND "+scope.sql+" AND t.status='done'"+filter+(search?" AND (c.name LIKE ? OR t.title LIKE ? OR t.period LIKE ?)":"");
  const args=[firm,...scope.args,...(search?Array(3).fill("%"+search+"%"):[])];
  const rows=(await db.prepare("SELECT t.id,t.title,t.period,t.service,t.due_date,c.name AS client_name,(SELECT COUNT(*) FROM filing_evidence f WHERE f.firm_id=t.firm_id AND f.task_id=t.id) AS evidence_count"+query+" ORDER BY t.completed_at DESC,t.id LIMIT 51 OFFSET ?").bind(...args,page*50).all()).results;
  return output({rows:rows.slice(0,50),page,has_more:rows.length>50});
 }
 const match=url.pathname.match(/^\/api\/filings\/([a-f0-9-]+)$/);
 if(!match)return fail("Not found",404);
 const task=await db.prepare("SELECT id,client_id,status FROM tasks WHERE id=? AND firm_id=?").bind(match[1],firm).first();
 if(!task||!(await canReadClient(db,user,task.client_id)))return fail("Assignment not found",404);
 if(request.method==="GET"){
  const entries=(await db.prepare("SELECT f.id,f.kind,f.reference,f.filed_on,f.evidence_location,f.note,f.created_at,u.name AS recorded_by FROM filing_evidence f JOIN users u ON u.id=f.recorded_by AND u.firm_id=f.firm_id WHERE f.firm_id=? AND f.task_id=? ORDER BY f.created_at DESC,f.id DESC LIMIT 100").bind(firm,task.id).all()).results;
  return output({entries});
 }
 if(request.method==="POST"){
  if(task.status!=="done")return fail("Complete the assignment before recording filing evidence",409);
  const filing=validateFiling(await bodyJSON(request),clean);
  if(!filing)return fail("Enter an evidence type, reference, non-future filing date and evidence location");
  const recordId=id(),at=iso();
  try{
   await db.batch([
    db.prepare("INSERT INTO filing_evidence(id,firm_id,task_id,kind,reference,filed_on,evidence_location,note,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(recordId,firm,task.id,filing.kind,filing.reference,filing.filed_on,filing.evidence_location,filing.note,user.id,at),
    await audit(db,user,"recorded","filing_evidence",recordId,{task_id:task.id,kind:filing.kind})
   ]);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("This evidence reference is already recorded for this assignment",409);throw e;}
  return output({id:recordId},201);
 }
 return fail("Not found",404);
}
