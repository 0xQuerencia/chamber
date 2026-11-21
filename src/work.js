// Review, assignment, time and comment workflows. No device surveillance is performed.
export async function handleWork(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validateFirmUser}=deps;
 const db=env.DB,path=new URL(request.url).pathname,method=request.method;
 const elevated=isPrivileged(user);
 if(path==="/api/workload"&&method==="GET"){
  if(!elevated)return fail("Insufficient permission",403);
  const people=(await db.prepare("SELECT id,name,role,capacity_hours_per_week FROM users WHERE firm_id=? AND active=1 ORDER BY name")
   .bind(user.firm_id).all()).results;
  const dueSoon=new Date();dueSoon.setUTCDate(dueSoon.getUTCDate()+14);
  const end=dueSoon.toISOString().slice(0,10);
  const work=(await db.prepare("SELECT assignee_id,COUNT(*) AS assigned,SUM(estimated_minutes) AS estimated_minutes,SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS active FROM tasks WHERE firm_id=? AND status!='done' AND (due_date IS NULL OR due_date<=?) GROUP BY assignee_id")
   .bind(user.firm_id,end).all()).results;
  const timers=(await db.prepare("SELECT user_id,COUNT(*) AS running FROM time_entries WHERE firm_id=? AND stopped_at IS NULL GROUP BY user_id")
   .bind(user.firm_id).all()).results;
  const members=people.map(p=>{
   const a=work.find(w=>w.assignee_id===p.id),timer=timers.find(t=>t.user_id===p.id);
   const minutes=Number(a?.estimated_minutes||0);
   return {id:p.id,name:p.name,role:p.role,capacity_hours_per_week:p.capacity_hours_per_week,
    open_tasks:Number(a?.assigned||0),estimated_minutes:minutes,
    load_percent:Math.round(minutes/(Number(p.capacity_hours_per_week)*60)*100),
    work_state:Number(timer?.running||0)>0||Number(a?.active||0)>0?"busy":"free"};
  });
  return output({members,unassigned:work.find(w=>w.assignee_id===null)?.assigned??0,
   policy:"Statuses reflect open Chamber work and manual timers only; no keystrokes or screenshots."});
 }
 const match=path.match(/^\/api\/tasks\/([a-f0-9-]+)\/(assignment|review|comments|timer|time)$/);
 if(!match)return fail("Not found",404);
 const taskId=match[1],kind=match[2],task=await db.prepare("SELECT * FROM tasks WHERE firm_id=? AND id=?").bind(user.firm_id,taskId).first();
 if(!task)return fail("Task not found",404);
 const assigned=task.assignee_id===user.id;
 const canAccess=elevated||assigned||task.reviewer_id===user.id;
 if(!canAccess)return fail("Insufficient permission",403);

 if(kind==="assignment"&&method==="PATCH"){
  if(!elevated)return fail("Only a manager can assign work",403);
  const data=await bodyJSON(request);
  const assignee=data.assignee_id===null?"":clean(data.assignee_id===undefined?task.assignee_id:data.assignee_id,100);
  const reviewer=data.reviewer_id===null?"":clean(data.reviewer_id===undefined?task.reviewer_id:data.reviewer_id,100);
  if(!(await validateFirmUser(db,user.firm_id,assignee))||!(await validateFirmUser(db,user.firm_id,reviewer)))
   return fail("Assignee and reviewer must belong to this firm");
  const at=iso();
  await db.batch([
   db.prepare("UPDATE tasks SET assignee_id=?,reviewer_id=?,updated_at=? WHERE firm_id=? AND id=?")
    .bind(assignee||null,reviewer||null,at,user.firm_id,taskId),
   db.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,note,at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id(),user.firm_id,taskId,user.id,task.status,task.status,"Assignment changed",at),
   await audit(db,user,"assigned","task",taskId,{assignee_id:assignee||null,reviewer_id:reviewer||null})
  ]);
  return output({ok:true});
 }

 if(kind==="review"&&method==="POST"){
  if(!elevated&&task.reviewer_id!==user.id)return fail("Reviewer permission required",403);
  const data=await bodyJSON(request);
  const decision=data.decision,note=clean(data.note,1000);
  if(task.status!=="review"||!["approve","return"].includes(decision))return fail("Task must be in review",409);
  if(decision==="return"&&!note)return fail("A reason is required when returning work");
  if(decision==="approve"){
   const pending=await db.prepare("SELECT COUNT(*) AS count FROM documents WHERE firm_id=? AND task_id=? AND status NOT IN ('received','verified','not_applicable')")
    .bind(user.firm_id,taskId).first();
   if(Number(pending?.count||0)>0)return fail("Required client information is still missing",409);
  }
  const status=decision==="approve"?"done":"in_progress",at=iso();
  await db.batch([
   db.prepare("UPDATE tasks SET status=?,completed_at=?,completed_by=?,updated_at=? WHERE firm_id=? AND id=?")
    .bind(status,decision==="approve"?at:null,decision==="approve"?user.id:null,at,user.firm_id,taskId),
   db.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,note,at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id(),user.firm_id,taskId,user.id,task.status,status,note||decision,at),
   await audit(db,user,decision==="approve"?"approved":"returned","task",taskId,{reason:note})
  ]);
  return output({ok:true,status});
 }

 if(kind==="comments"&&method==="GET"){
  const comments=(await db.prepare("SELECT c.id,c.body,c.created_at,u.name AS author FROM task_comments c JOIN users u ON c.user_id=u.id WHERE c.firm_id=? AND c.task_id=? ORDER BY c.created_at,c.id")
   .bind(user.firm_id,taskId).all()).results;
  return output({comments});
 }
 if(kind==="comments"&&method==="POST"){
  const data=await bodyJSON(request),body=clean(data.body,2000);
  if(!body)return fail("Comment must contain text");
  const at=iso(),commentId=id();
  await db.batch([
   db.prepare("INSERT INTO task_comments(id,firm_id,task_id,user_id,body,created_at) VALUES(?,?,?,?,?,?)")
    .bind(commentId,user.firm_id,taskId,user.id,body,at),
   await audit(db,user,"commented","task",taskId,{comment_id:commentId})
  ]);
  return output({id:commentId},201);
 }

 if(kind==="timer"&&method==="POST"){
  const data=await bodyJSON(request),action=data.action;
  if(!["start","stop"].includes(action))return fail("Timer action must be start or stop");
  const at=iso();
  if(action==="start"){
   if(task.status==="done"||task.status==="review")return fail("Cannot start a completed or review task",409);
   if(!assigned&&!elevated)return fail("Only the assignee can start the timer",403);
   try{
    await db.batch([
     db.prepare("INSERT INTO time_entries(id,firm_id,task_id,user_id,started_at,created_at) VALUES(?,?,?,?,?,?)")
      .bind(id(),user.firm_id,taskId,user.id,at,at),
     db.prepare("UPDATE tasks SET status='in_progress',started_at=COALESCE(started_at,?),updated_at=? WHERE firm_id=? AND id=?")
      .bind(at,at,user.firm_id,taskId),
     db.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,note,at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id(),user.firm_id,taskId,user.id,task.status,"in_progress","Timer started",at),
     await audit(db,user,"started_timer","task",taskId)
    ]);
   }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("A timer is already running for this user",409);throw e;}
   return output({ok:true,running:true});
  }
  const running=await db.prepare("SELECT id,started_at FROM time_entries WHERE firm_id=? AND task_id=? AND user_id=? AND stopped_at IS NULL")
   .bind(user.firm_id,taskId,user.id).first();
  if(!running)return fail("No running timer for this task",409);
  const minutes=Math.max(1,Math.ceil((Date.now()-new Date(running.started_at).getTime())/60000));
  await db.batch([
   db.prepare("UPDATE time_entries SET stopped_at=?,duration_minutes=? WHERE id=? AND firm_id=?")
    .bind(at,minutes,running.id,user.firm_id),
   await audit(db,user,"stopped_timer","task",taskId,{minutes})
  ]);
  return output({ok:true,running:false,minutes});
 }

 if(kind==="time"&&method==="GET"){
  const rows=(await db.prepare("SELECT user_id,started_at,stopped_at,duration_minutes FROM time_entries WHERE firm_id=? AND task_id=? ORDER BY started_at DESC")
    .bind(user.firm_id,taskId).all()).results;
  return output({entries:rows});
 }
 return fail("Not found",404);
}
