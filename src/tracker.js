import { validCalendarDate, validMonth, sequenceMonths, shiftCalendarDays, trackerCellState } from "./domain.js";
import {clientScope,canReadClient} from "./permissions.js";

// Permission and audit primitives are passed from the authenticated Worker entrypoint.
export async function handleWorkflow(request, env, user, deps) {
 const {output,fail,clean,audit,id,iso,isPrivileged} = deps;
 const db=env.DB, url=new URL(request.url),path=url.pathname,method=request.method;
 const elevated=isPrivileged(user);

 if(path==="/api/requirements"&&method==="POST") {
  if(user.role!=="principal")return fail("Only principal can change firm-wide requirements",403);
  const data=await deps.bodyJSON(request);
  const templateId=clean(data.template_id,100),name=clean(data.name,180);
  const required=data.required===false?0:1,sort=data.sort_order===undefined?0:Number(data.sort_order);
  if(!name||!Number.isInteger(sort)||sort<0||sort>10000)return fail("Valid name and sort order required");
  const template=await db.prepare("SELECT id FROM service_templates WHERE firm_id=? AND id=?").bind(user.firm_id,templateId).first();
  if(!template)return fail("Template not found",404);
  const rid=id(),at=iso();
  const existing=(await db.prepare("SELECT r.task_id,t.client_id FROM recurrence_runs r JOIN tasks t ON t.id=r.task_id AND t.firm_id=r.firm_id WHERE r.firm_id=? AND r.template_id=? AND t.status!='done'")
   .bind(user.firm_id,templateId).all()).results;
  try {
   const statements=[
    db.prepare("INSERT INTO requirement_templates(id,firm_id,template_id,name,required,sort_order,created_at) VALUES(?,?,?,?,?,?,?)")
     .bind(rid,user.firm_id,templateId,name,required,sort,at)
   ];
   if(required)for(const row of existing)statements.push(
    db.prepare("INSERT INTO documents(id,firm_id,task_id,client_id,name,status,requirement_template_id,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?,?)")
     .bind(id(),user.firm_id,row.task_id,row.client_id,name,rid,at,at)
   );
   statements.push(await audit(db,user,"created","requirement_template",rid,{template_id:templateId,required}));
   await db.batch(statements);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("Requirement already exists",409);throw e;}
  return output({id:rid,applied_to_open_tasks:required?existing.length:0},201);
 }

 if(path==="/api/overrides"&&method==="POST") {
  if(user.role!=="principal")return fail("Only principal can change firm-wide deadline overrides",403);
  const data=await deps.bodyJSON(request);
  const templateId=clean(data.template_id,100),period=clean(data.period,10);
  const due=clean(data.new_due_date,10),reference=clean(data.source_reference,300);
  if(!/^(20\d\d)-(0[1-9]|1[0-2]|Q[1-4])$|^20\d\d$/.test(period)||!validCalendarDate(due)||!reference)
   return fail("Valid period, calendar due date, and extension source required");
  const template=await db.prepare("SELECT id,ask_by_lead_days FROM service_templates WHERE firm_id=? AND id=?").bind(user.firm_id,templateId).first();
  if(!template)return fail("Template not found",404);
  const tasks=(await db.prepare("SELECT t.id,t.status FROM recurrence_runs r JOIN tasks t ON t.id=r.task_id AND t.firm_id=r.firm_id WHERE r.firm_id=? AND r.template_id=? AND r.period=? AND t.status!='done'")
    .bind(user.firm_id,templateId,period).all()).results;
  const at=iso(),askBy=shiftCalendarDays(due,-Number(template.ask_by_lead_days));
  const updates=[
   db.prepare("INSERT INTO due_date_overrides(id,firm_id,template_id,period,new_due_date,source_reference,changed_by,changed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(firm_id,template_id,period) DO UPDATE SET new_due_date=excluded.new_due_date,source_reference=excluded.source_reference,changed_by=excluded.changed_by,changed_at=excluded.changed_at")
    .bind(id(),user.firm_id,templateId,period,due,reference,user.id,at)
  ];
  for(const t of tasks) {
   updates.push(db.prepare("UPDATE tasks SET due_date=?,ask_by_date=?,updated_at=? WHERE id=? AND firm_id=?")
    .bind(due,askBy,at,t.id,user.firm_id));
   updates.push(db.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,note,at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id(),user.firm_id,t.id,user.id,t.status,t.status,"Due date override: "+reference,at));
  }
  updates.push(await audit(db,user,"overrode","due_date",templateId,{period,new_due_date:due,reference,updated_tasks:tasks.length}));
  await db.batch(updates);
  return output({ok:true,updated_tasks:tasks.length});
 }

 if(path==="/api/tracker"&&method==="GET") {
  const from=url.searchParams.get("from")||"";
  if(!validMonth(from))return fail("from must be a YYYY-MM month",400);
  const periods=sequenceMonths(from),size=Math.min(200,Math.max(1,Math.floor(Number(url.searchParams.get("size"))||100)));
  const page=Math.max(0,Math.floor(Number(url.searchParams.get("page"))||0));
  const service=clean(url.searchParams.get("service"),80),staffOnly=user.role==="staff",scope=clientScope(user,"c");
  const clients=(await db.prepare("SELECT c.id,c.name,c.category FROM clients c WHERE c.firm_id=? AND c.archived_at IS NULL AND "+
     scope.sql+" ORDER BY c.name LIMIT ? OFFSET ?")
    .bind(user.firm_id,...scope.args,size+1,page*size).all()).results;
  const visible=clients.slice(0,size);
  const rows=visible.map(c=>({id:c.id,name:c.name,category:c.category,cells:periods.map(period=>({period,state:"not_due",tasks:0,total:0,received:0,waived:0}))}));
  if(visible.length) {
   const clientSlots=visible.map(()=>"?").join(","),periodSlots=periods.map(()=>"?").join(",");
   const sql="SELECT t.client_id,t.period,COUNT(DISTINCT t.id) AS tasks,COUNT(d.id) AS total,"+
    "SUM(CASE WHEN d.status IN ('received','verified') THEN 1 ELSE 0 END) AS received,"+
    "SUM(CASE WHEN d.status='not_applicable' THEN 1 ELSE 0 END) AS waived "+
    "FROM tasks t LEFT JOIN documents d ON d.task_id=t.id AND d.firm_id=t.firm_id "+
    "WHERE t.firm_id=? AND t.client_id IN ("+clientSlots+") AND t.period IN ("+periodSlots+") "+
    (service?"AND t.service=? ":"")+(staffOnly?"AND t.assignee_id=? ":"")+
    "GROUP BY t.client_id,t.period";
   const args=[user.firm_id,...visible.map(c=>c.id),...periods,...(service?[service]:[]),...(staffOnly?[user.id]:[])];
   const totals=(await db.prepare(sql).bind(...args).all()).results;
   const byId=new Map(rows.map(r=>[r.id,r]));
   for(const t of totals) {
    const cell=byId.get(t.client_id)?.cells.find(c=>c.period===t.period);
    if(!cell)continue;
    cell.tasks=Number(t.tasks)||0;cell.total=Number(t.total)||0;
    cell.received=Number(t.received)||0;cell.waived=Number(t.waived)||0;
    cell.state=trackerCellState(cell.tasks,cell.total,cell.received,cell.waived);
   }
  }
  return output({periods,clients:rows,page,has_more:clients.length>size,service:service||null});
 }

 if(path==="/api/tracker/detail"&&method==="GET") {
  const cid=clean(url.searchParams.get("client_id"),100),period=clean(url.searchParams.get("period"),7);
  if(!cid||!validMonth(period))return fail("Client and YYYY-MM period required");
  const client=await db.prepare("SELECT id,name FROM clients WHERE firm_id=? AND id=?").bind(user.firm_id,cid).first();
  if(!client||!(await canReadClient(db,user,cid)))return fail("Client not found or access denied",404);
  const staffOnly=user.role==="staff";
  const tasks=(await db.prepare("SELECT id,title,service,status,due_date,ask_by_date FROM tasks WHERE firm_id=? AND client_id=? AND period=? "+
    (staffOnly?"AND assignee_id=? ":"")+"ORDER BY due_date,id")
   .bind(...(staffOnly?[user.firm_id,cid,period,user.id]:[user.firm_id,cid,period])).all()).results;
  if(staffOnly&&!tasks.length)return fail("Insufficient permission",403);
  const ids=tasks.map(t=>t.id);
  const documents=ids.length?(await db.prepare("SELECT id,task_id,name,status,requested_at,received_at,verified_at,received_via,receipt_note FROM documents WHERE firm_id=? AND task_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY name")
    .bind(user.firm_id,...ids).all()).results:[];
  return output({client,period,tasks,documents});
 }

 if(path==="/api/inward"&&method==="POST") {
  const data=await deps.bodyJSON(request);
  const cid=clean(data.client_id,100),period=clean(data.period,7);
  const via=clean(data.received_via||"courier",30),note=clean(data.note,500);
  const ids=Array.isArray(data.document_ids)?data.document_ids:[];
  if(!cid||!validMonth(period)||!ids.length||ids.length>50||ids.some(x=>typeof x!=="string"||!/^[a-f0-9-]{36}$/.test(x))||
    new Set(ids).size!==ids.length||!["courier","email","whatsapp","portal","in_person","other"].includes(via))
    return fail("Valid client, period, receipt source and 1–50 document IDs required");
  if(!(await canReadClient(db,user,cid)))return fail("Client not found or access denied",404);
  const docs=(await db.prepare("SELECT d.id,d.status,d.task_id,t.assignee_id FROM documents d JOIN tasks t ON d.task_id=t.id AND d.firm_id=t.firm_id WHERE d.firm_id=? AND t.client_id=? AND t.period=? AND d.id IN ("+ids.map(()=>"?").join(",")+")")
   .bind(user.firm_id,cid,period,...ids).all()).results;
  if(docs.length!==ids.length)return fail("Requirement not found",404);
  if(docs.some(d=>(!elevated&&d.assignee_id!==user.id)||["verified","not_applicable"].includes(d.status)))
    return fail("Cannot mark verified, waived or inaccessible requirements received",403);
  const changed=docs.filter(d=>d.status!=="received"),at=iso(),statements=[];
  for(const doc of changed) {
   statements.push(db.prepare("UPDATE documents SET status='received',received_at=?,received_via=?,receipt_note=?,updated_at=? WHERE id=? AND firm_id=?")
    .bind(at,via,note||null,at,doc.id,user.firm_id));
   statements.push(await audit(db,user,"received","document",doc.id,{task_id:doc.task_id,source:via}));
  }
  if(statements.length)await db.batch(statements);
  return output({received:changed.length,already_received:docs.length-changed.length});
 }

 const history=path.match(/^\/api\/tasks\/([a-f0-9-]+)\/history$/);
 if(history&&method==="GET") {
  const task=await db.prepare("SELECT id,client_id,assignee_id FROM tasks WHERE firm_id=? AND id=?").bind(user.firm_id,history[1]).first();
  if(!task||!(await canReadClient(db,user,task.client_id)))return fail("Task not found",404);
  if(user.role==="staff"&&task.assignee_id!==user.id)return fail("Insufficient permission",403);
  const events=(await db.prepare("SELECT e.id,e.from_status,e.to_status,e.note,e.at,u.name AS actor_name FROM task_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.firm_id=? AND e.task_id=? ORDER BY e.at DESC")
   .bind(user.firm_id,task.id).all()).results;
  return output({events});
 }
 return fail("Not found",404);
}
