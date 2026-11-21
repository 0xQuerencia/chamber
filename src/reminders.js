import {dayGap,normalizeReminderRule,reminderStage,quietHoursActive,validClock,validDay} from "./reminder-policy.js";
import {shiftCalendarDays} from "./domain.js";

const asIST=(clock=new Date())=>{
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(clock);
 const get=k=>parts.find(p=>p.type===k)?.value??"";
 return get("year")+"-"+get("month")+"-"+get("day");
};
const DEFAULT={ask_days:10,remind_days:6,escalate_days:3,max_reminders:4,
 quiet_start:"21:00",quiet_end:"08:00",enabled:0};

/**
 * Prepare auditable suggestions only. This scheduler never queues or sends messages.
 * Only unresolved missing document requirements can create suggestions.
 */
export async function refreshReminderSuggestions(db,now=asIST(),firmFilter=null){
 if(!validDay(now))throw Error("Invalid scheduler date");
 const rules=(await db.prepare("SELECT firm_id,ask_days,remind_days,escalate_days,max_reminders FROM reminder_rules WHERE enabled=1 "+
  (firmFilter?"AND firm_id=?":"")+" ORDER BY firm_id").bind(...(firmFilter?[firmFilter]:[])).all()).results;
 const counts={created:0,already:0,resolved:0,blocked:0,checked:0,enabled_firms:rules.length};
 const at=new Date().toISOString();
 for(const raw of rules){
  const rule=normalizeReminderRule(raw),firm=raw.firm_id,through=shiftCalendarDays(now,rule.ask_days);
  // Resolve stale pending entries after documents arrive or assignments are completed.
  const updated=await db.prepare("UPDATE reminder_suggestions SET status='resolved',updated_at=? WHERE firm_id=? AND status='pending' AND NOT EXISTS ("+
   "SELECT 1 FROM tasks t JOIN documents d ON d.task_id=t.id AND d.firm_id=t.firm_id "+
   "WHERE t.firm_id=reminder_suggestions.firm_id AND t.client_id=reminder_suggestions.client_id "+
   "AND t.period=reminder_suggestions.period AND t.status!='done' "+
   "AND d.status NOT IN ('received','verified','not_applicable'))").bind(at,firm).run();
  counts.resolved+=Number(updated.meta?.changes||0);
  // One client-period receives a stage suggestion, even if several services are due.
  const due=(await db.prepare("SELECT t.client_id,t.period,MIN(t.due_date) AS due_date,COUNT(d.id) AS missing_count "+
   "FROM tasks t JOIN documents d ON d.task_id=t.id AND d.firm_id=t.firm_id "+
   "JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id "+
   "WHERE t.firm_id=? AND c.archived_at IS NULL AND t.status!='done' "+
   "AND t.due_date>=? AND t.due_date<=? AND t.period GLOB '????-??' "+
   "AND d.status NOT IN ('received','verified','not_applicable') "+
   "GROUP BY t.client_id,t.period ORDER BY due_date,t.client_id LIMIT 1500")
   .bind(firm,now,through).all()).results;
  counts.checked+=due.length;
  for(const item of due){
   const stage=reminderStage(dayGap(now,item.due_date),rule);
   if(!stage)continue;
   const paused=await db.prepare("SELECT paused_until FROM reminder_client_pauses WHERE firm_id=? AND client_id=? AND paused_until>=?")
    .bind(firm,item.client_id,now).first();
   if(paused){counts.blocked++;continue;}
   const already=await db.prepare("SELECT COUNT(*) AS n FROM reminder_suggestions WHERE firm_id=? AND client_id=? AND period=?")
    .bind(firm,item.client_id,item.period).first();
   const exists=await db.prepare("SELECT id FROM reminder_suggestions WHERE firm_id=? AND client_id=? AND period=? AND stage=?")
    .bind(firm,item.client_id,item.period,stage).first();
   if(exists){counts.already++;continue}
   if(Number(already.n)>=rule.max_reminders){counts.blocked++;continue}
   const uid=crypto.randomUUID();
   const result=await db.prepare("INSERT OR IGNORE INTO reminder_suggestions(id,firm_id,client_id,period,stage,due_date,missing_count,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)")
    .bind(uid,firm,item.client_id,item.period,stage,item.due_date,Number(item.missing_count),at,at).run();
   if(Number(result.meta?.changes||0)){
    counts.created++;
    await db.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?,?,?)")
     .bind(crypto.randomUUID(),firm,null,"reminder_suggested","reminder",uid,JSON.stringify({stage,period:item.period}),at).run();
   }else counts.already++;
  }
 }
 return counts;
}

export async function handleReminderApi(request,env,user,deps){
 const {output,fail,clean,audit,iso,bodyJSON,isPrivileged}=deps;
 if(!isPrivileged(user))return fail("Manager or principal permission required",403);
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method,firm=user.firm_id;
 if(path==="/api/reminders/config"&&method==="GET"){
  const config=await db.prepare("SELECT ask_days,remind_days,escalate_days,max_reminders,quiet_start,quiet_end,enabled FROM reminder_rules WHERE firm_id=?").bind(firm).first();
  return output({config:config??DEFAULT,delivery_enabled:false});
 }
 if(path==="/api/reminders/config"&&method==="PUT"){
  if(user.role!=="principal")return fail("Only the principal can change reminder policy",403);
  const data=await bodyJSON(request);
  let cadence;
  try{cadence=normalizeReminderRule(data)}catch(e){return fail(e.message)}
  const start=clean(data.quiet_start??DEFAULT.quiet_start,5),end=clean(data.quiet_end??DEFAULT.quiet_end,5);
  if(!validClock(start)||!validClock(end))return fail("Quiet hours must be HH:MM",400);
  const enabled=data.enabled===true||data.enabled===1?1:0;
  const at=iso();
  await db.batch([
   db.prepare("INSERT INTO reminder_rules(id,firm_id,ask_days,remind_days,escalate_days,quiet_start,quiet_end,max_reminders,enabled,created_at) "+
    "VALUES(?,?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(firm_id) DO UPDATE SET ask_days=excluded.ask_days,remind_days=excluded.remind_days,escalate_days=excluded.escalate_days,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,max_reminders=excluded.max_reminders,enabled=excluded.enabled")
    .bind(crypto.randomUUID(),firm,cadence.ask_days,cadence.remind_days,cadence.escalate_days,start,end,cadence.max_reminders,enabled,at),
   await audit(db,user,"updated","reminder_policy",firm,{enabled,ask_days:cadence.ask_days,remind_days:cadence.remind_days,escalate_days:cadence.escalate_days})
  ]);
  return output({config:{...cadence,enabled,quiet_start:start,quiet_end:end},delivery_enabled:false});
 }
 if(path==="/api/reminders/refresh"&&method==="POST"){
  const result=await refreshReminderSuggestions(db,asIST(),firm);
  return output({result,delivery_enabled:false});
 }
 if(path==="/api/reminders"&&method==="GET"){
  const status=url.searchParams.get("status")||"pending";
  if(!["pending","prepared","resolved","dismissed"].includes(status))return fail("Invalid suggestion status");
  const page=Math.max(0,Math.min(99,Math.floor(Number(url.searchParams.get("page"))||0))),size=50;
  const [total,items]=await Promise.all([
   db.prepare("SELECT COUNT(*) AS n FROM reminder_suggestions WHERE firm_id=? AND status=?").bind(firm,status).first(),
   db.prepare("SELECT s.id,s.client_id,c.name AS client_name,c.code AS client_code,s.period,s.stage,s.due_date,s.missing_count,s.status,s.prepared_batch_id,s.created_at,p.paused_until "+
    "FROM reminder_suggestions s JOIN clients c ON c.id=s.client_id AND c.firm_id=s.firm_id "+
    "LEFT JOIN reminder_client_pauses p ON p.firm_id=s.firm_id AND p.client_id=s.client_id "+
    "WHERE s.firm_id=? AND s.status=? ORDER BY s.due_date ASC,s.created_at DESC LIMIT ? OFFSET ?")
    .bind(firm,status,size,page*size).all()
  ]);
  return output({items:items.results,total:Number(total.n),page,delivery_enabled:false});
 }
 const pause=path.match(/^\/api\/reminders\/clients\/([a-f0-9-]+)\/(pause|resume)$/);
 if(pause&&method==="POST"){
  const cid=pause[1],action=pause[2];
  const exists=await db.prepare("SELECT id FROM clients WHERE firm_id=? AND id=? AND archived_at IS NULL").bind(firm,cid).first();
  if(!exists)return fail("Client not found",404);
  if(action==="resume"){
   await db.batch([
    db.prepare("DELETE FROM reminder_client_pauses WHERE firm_id=? AND client_id=?").bind(firm,cid),
    await audit(db,user,"resumed","reminder_client",cid)
   ]);
   return output({ok:true});
  }
  const data=await bodyJSON(request),until=clean(data.paused_until,10),reason=clean(data.reason,300),today=asIST();
  if(!validDay(until)||until<today||until>shiftCalendarDays(today,365)||!reason)return fail("Choose a future pause date within 365 days and explain why",400);
  await db.batch([
   db.prepare("INSERT INTO reminder_client_pauses(firm_id,client_id,paused_until,reason,updated_by,updated_at) VALUES(?,?,?,?,?,?) "+
    "ON CONFLICT(firm_id,client_id) DO UPDATE SET paused_until=excluded.paused_until,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
    .bind(firm,cid,until,reason,user.id,iso()),
   await audit(db,user,"paused","reminder_client",cid,{until,reason})
  ]);
  return output({ok:true,paused_until:until});
 }
 const item=path.match(/^\/api\/reminders\/([a-f0-9-]+)\/(dismiss|prepared)$/);
 if(item&&method==="POST"){
  const row=await db.prepare("SELECT id,status,client_id FROM reminder_suggestions WHERE firm_id=? AND id=?").bind(firm,item[1]).first();
  if(!row)return fail("Suggestion not found",404);
  if(row.status!=="pending")return fail("Only pending suggestions can be changed",409);
  const data=await bodyJSON(request),action=item[2];
  if(action==="prepared"){
   const batchId=clean(data.batch_id,100);
   const proof=await db.prepare("SELECT m.id FROM messages m JOIN message_batches b ON b.id=m.batch_id AND b.firm_id=m.firm_id WHERE m.firm_id=? AND m.batch_id=? AND m.client_id=? AND b.status='draft' LIMIT 1")
    .bind(firm,batchId,row.client_id).first();
   if(!proof)return fail("No matching draft batch for this client",400);
   await db.batch([
    db.prepare("UPDATE reminder_suggestions SET status='prepared',prepared_batch_id=?,updated_at=? WHERE firm_id=? AND id=?")
     .bind(batchId,iso(),firm,row.id),
    await audit(db,user,"prepared","reminder",row.id,{batch_id:batchId})
   ]);
   return output({ok:true,status:"prepared"});
  }
  const reason=clean(data.reason,300);
  if(!reason)return fail("Reason for dismissal is required",400);
  await db.batch([
   db.prepare("UPDATE reminder_suggestions SET status='dismissed',updated_at=? WHERE firm_id=? AND id=?")
    .bind(iso(),firm,row.id),
   await audit(db,user,"dismissed","reminder",row.id,{reason})
  ]);
  return output({ok:true,status:"dismissed"});
 }
 return fail("Not found",404);
}
