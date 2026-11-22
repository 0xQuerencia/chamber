import { shiftCalendarDays } from "./domain.js";
import {clientScope} from "./permissions.js";

// All counts are derived from SQL, not capped browser bootstrap arrays.
const drilldowns={
 due_soon:{sql:"t.status!='done' AND t.due_date>=? AND t.due_date<=?",dateParams:(a,b)=>[a,b],type:"task"},
 overdue:{sql:"t.status!='done' AND t.due_date<?",dateParams:a=>[a],type:"task"},
 unassigned:{sql:"t.status!='done' AND t.assignee_id IS NULL",dateParams:()=>[],type:"task"},
 review:{sql:"t.status='review'",dateParams:()=>[],type:"task"},
 waiting:{sql:"t.status='waiting'",dateParams:()=>[],type:"task"},
 missing:{sql:"t.status!='done' AND d.status NOT IN ('received','verified','not_applicable')",dateParams:()=>[],type:"document"}
};
function indiaDate(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const val=t=>parts.find(p=>p.type===t)?.value??"";
 return val("year")+"-"+val("month")+"-"+val("day");
}
export async function handleReports(request,env,user,deps){
 const {output,fail,isPrivileged}=deps;
 if(!isPrivileged(user))return fail("Manager or principal permission required",403);
 const db=env.DB,url=new URL(request.url),path=url.pathname,today=indiaDate(),week=shiftCalendarDays(today,7);
 const firm=user.firm_id,scope=clientScope(user,"c"),manager=user.role==="manager";
 const simpleQuery=(where,args=[])=>db.prepare("SELECT COUNT(*) AS n FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id WHERE t.firm_id=? AND "+scope.sql+" AND "+where)
  .bind(firm,...scope.args,...args).first();
 if(path==="/api/reports/dashboard"&&request.method==="GET"){
  const [due,overdue,unassigned,review,waiting,missing,staff,deadlineResult,activityResult,staffWorkResult,serviceResult,clientResponsiveness]=await Promise.all([
   simpleQuery(drilldowns.due_soon.sql,[today,week]),
   simpleQuery(drilldowns.overdue.sql,[today]),
   simpleQuery(drilldowns.unassigned.sql),
   simpleQuery(drilldowns.review.sql),
   simpleQuery(drilldowns.waiting.sql),
   db.prepare("SELECT COUNT(*) AS n FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id JOIN clients c ON c.id=d.client_id AND c.firm_id=d.firm_id WHERE d.firm_id=? AND "+scope.sql+" AND t.status!='done' AND d.status NOT IN ('received','verified','not_applicable')").bind(firm,...scope.args).first(),
   db.prepare("SELECT COUNT(*) AS n FROM users WHERE firm_id=? AND active=1 "+(manager?"AND (id=? OR manager_id=?)":"")).bind(...(manager?[firm,user.id,user.id]:[firm])).first(),
   db.prepare("SELECT t.id,t.title,t.client_id,c.name AS client_name,t.service,t.period,t.status,t.due_date,t.ask_by_date,u.name AS assignee_name FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id LEFT JOIN users u ON t.assignee_id=u.id AND t.firm_id=u.firm_id WHERE t.firm_id=? AND "+scope.sql+" AND t.status!='done' AND t.due_date IS NOT NULL ORDER BY t.due_date ASC,t.id LIMIT 15").bind(firm,...scope.args).all(),
   db.prepare("SELECT a.id,a.event,a.entity_type,a.entity_id,a.at,u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id AND u.firm_id=a.firm_id WHERE a.firm_id=? "+(manager?"AND a.actor_id=? ":"")+"ORDER BY a.at DESC LIMIT 20").bind(...(manager?[firm,user.id]:[firm])).all(),
   db.prepare("SELECT u.id,u.name,u.role,u.capacity_hours_per_week,COUNT(t.id) AS open_tasks,COALESCE(SUM(t.estimated_minutes),0) AS estimated_minutes FROM users u LEFT JOIN tasks t ON t.assignee_id=u.id AND t.firm_id=u.firm_id AND t.status!='done' AND EXISTS (SELECT 1 FROM clients c WHERE c.id=t.client_id AND c.firm_id=t.firm_id AND "+scope.sql+") WHERE u.firm_id=? AND u.active=1 "+(manager?"AND (u.id=? OR u.manager_id=?) ":"")+"GROUP BY u.id ORDER BY open_tasks DESC,u.name")
    .bind(...scope.args,firm,...(manager?[user.id,user.id]:[])).all(),
   db.prepare("SELECT t.service,COUNT(*) AS total,SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN t.status!='done' AND t.due_date<? THEN 1 ELSE 0 END) AS overdue FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id WHERE t.firm_id=? AND "+scope.sql+" GROUP BY t.service ORDER BY total DESC LIMIT 15").bind(today,firm,...scope.args).all(),
   db.prepare("SELECT COUNT(*) AS received_count,ROUND(AVG(julianday(d.received_at)-julianday(d.requested_at)),1) AS avg_response_days FROM documents d JOIN clients c ON c.id=d.client_id AND c.firm_id=d.firm_id WHERE d.firm_id=? AND "+scope.sql+" AND d.requested_at IS NOT NULL AND d.received_at IS NOT NULL").bind(firm,...scope.args).first()
  ]);
  const kpis={due_soon:Number(due.n),overdue:Number(overdue.n),missing:Number(missing.n),
    unassigned:Number(unassigned.n),review:Number(review.n),waiting:Number(waiting.n)};
  return output({today,through:week,kpis,team_count:Number(staff.n),
   deadlines:deadlineResult.results,activity:activityResult.results,
   workload:staffWorkResult.results.map(x=>({...x,open_tasks:Number(x.open_tasks),estimated_minutes:Number(x.estimated_minutes),
    load_percent:Math.round(Number(x.estimated_minutes)/(Number(x.capacity_hours_per_week)*60)*100)})),
   services:serviceResult.results.map(x=>({...x,total:Number(x.total),done:Number(x.done),overdue:Number(x.overdue)})),
   responsiveness:{received_count:Number(clientResponsiveness.received_count),avg_response_days:clientResponsiveness.avg_response_days}});
 }
 if(path==="/api/reports/drilldown"&&request.method==="GET"){
  const kind=url.searchParams.get("kind"),def=drilldowns[kind];
  if(!def)return fail("Unknown report type",400);
  const page=Math.max(0,Math.min(100,Math.floor(Number(url.searchParams.get("page"))||0))),limit=50;
  const params=def.dateParams(today,week);
  if(def.type==="document"){
   const where=def.sql;
   const count=await db.prepare("SELECT COUNT(*) AS n FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id JOIN clients c ON c.id=d.client_id AND c.firm_id=d.firm_id WHERE d.firm_id=? AND "+scope.sql+" AND "+where).bind(firm,...scope.args,...params).first();
   const result=(await db.prepare("SELECT d.id,d.name AS title,d.status,t.client_id,c.name AS client_name,t.service,t.period,t.due_date,t.ask_by_date FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id JOIN clients c ON c.id=d.client_id AND c.firm_id=d.firm_id WHERE d.firm_id=? AND "+scope.sql+" AND "+where+" ORDER BY t.due_date ASC,d.name LIMIT ? OFFSET ?").bind(firm,...scope.args,...params,limit,page*limit).all()).results;
   return output({kind,total:Number(count.n),page,rows:result});
  }
  const count=await simpleQuery(def.sql,params);
  const result=(await db.prepare("SELECT t.id,t.title,t.status,t.client_id,c.name AS client_name,t.service,t.period,t.due_date,t.ask_by_date FROM tasks t JOIN clients c ON c.id=t.client_id AND c.firm_id=t.firm_id WHERE t.firm_id=? AND "+scope.sql+" AND "+def.sql+" ORDER BY t.due_date ASC,t.id LIMIT ? OFFSET ?").bind(firm,...scope.args,...params,limit,page*limit).all()).results;
  return output({kind,total:Number(count.n),page,rows:result});
 }
 return fail("Not found",404);
}
