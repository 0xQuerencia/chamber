import { clean, validEmail, safeStatus, statusForRole, csvCell } from "./validation.js";
import { validCalendarDate, shiftCalendarDays } from "./domain.js";
import { handleWorkflow } from "./tracker.js";
import { handleClientMaster } from "./clients.js";
import { handleWork } from "./work.js";
import { handleImports } from "./imports.js";
import { handleMessages } from "./messages.js";
import { handleReports } from "./reports.js";
import { handleSheetSettings, scheduledSheetSync } from "./sheets.js";
import { handleFiles, scanCallback } from "./files.js";
import { handleReminderApi, refreshReminderSuggestions } from "./reminders.js";
import {beginMfaChallenge,handleMfa} from "./mfa.js";
import { normalizeIdentifier, validPan, validGstin, validClientPhone } from "./client-validation.js";

const enc = new TextEncoder();
const SESSION_DAYS = 7;
const SESSION_IDLE_MINUTES = 30;
const iso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const fail = (message, code = 400) => output({ error: message }, code);
const output = (data, code = 200, headers = {}) => new Response(JSON.stringify(data), {
  status: code,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }
});
const isPrivileged = user => user.role === "principal" || user.role === "manager";
const hashToken = async token => {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
};
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const rawB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
async function derivePassword(password, salt) {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: rawB64(salt), iterations: 250000, hash: "SHA-256"
  }, material, 256)));
}
async function passwordRecord(password) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, password_hash: await derivePassword(password, salt) };
}
function equalConstant(a, b) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function bodyJSON(request) {
  if (Number(request.headers.get("Content-Length") || 0) > 32768) throw Error("Request too large");
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw Error("JSON content type required");
  const text = await request.text();
  if (text.length > 32768) throw Error("Request too large");
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Error("Expected an object");
  return parsed;
}
function assertOrigin(request) {
  const origin = request.headers.get("Origin");
  const expected = new URL(request.url).origin;
  return origin === expected;
}
async function sessionFor(request, db) {
  const cookie=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("chamber_session="));
  if(!cookie)return null;
  const token=cookie.slice("chamber_session=".length);
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const tokenHash=await hashToken(token),now=iso();
  const idleCutoff=new Date(Date.now()-SESSION_IDLE_MINUTES*60000).toISOString();
  const row=await db.prepare("SELECT u.id,u.firm_id,u.name,u.email,u.role,u.active,s.device_id,s.last_active_at FROM sessions s JOIN users u ON s.user_id=u.id LEFT JOIN devices d ON d.id=s.device_id AND d.user_id=u.id AND d.firm_id=u.firm_id WHERE s.token_hash=? AND s.expires_at>? AND COALESCE(s.last_active_at,s.created_at)>? AND u.active=1 AND (s.device_id IS NULL OR (d.id IS NOT NULL AND d.revoked_at IS NULL))")
   .bind(tokenHash,now,idleCutoff).first();
  if(!row)return null;
  if(!row.last_active_at||row.last_active_at<new Date(Date.now()-60000).toISOString()){
   const updates=[db.prepare("UPDATE sessions SET last_active_at=? WHERE token_hash=?").bind(now,tokenHash)];
   if(row.device_id)updates.push(db.prepare("UPDATE devices SET last_seen_at=? WHERE id=? AND firm_id=?").bind(now,row.device_id,row.firm_id));
   await db.batch(updates);
  }
  return row;
}
async function audit(db, user, event, entityType, entityId, details = {}) {
  return db.prepare("INSERT INTO activity (id,firm_id,actor_id,event,entity_type,entity_id,details,at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id(), user.firm_id, user.id, event, entityType, entityId, JSON.stringify(details), iso());
}
async function handleSetup(request, env) {
  const existing = await env.DB.prepare("SELECT COUNT(*) as n FROM users").first();
  if (existing.n !== 0) return fail("Already initialized", 409);
  const submitted = request.headers.get("X-Setup-Token") || "";
  if (!env.SETUP_TOKEN || !equalConstant(submitted, env.SETUP_TOKEN)) return fail("Invalid setup token", 403);
  const data = await bodyJSON(request);
  const firmName = clean(data.firm, 120), name = clean(data.name, 100);
  const email = clean(data.email, 200).toLowerCase();
  const password = String(data.password || "");
  if (!firmName || !name || !validEmail(email) || password.length < 12 || password.length > 128) return fail("Firm, name, valid email, and password (12–128 characters) are required");
  const firmId = id(), userId = id(), at = iso();
  const pw = await passwordRecord(password);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO firms (id,name,created_at) VALUES (?,?,?)").bind(firmId, firmName, at),
    env.DB.prepare("INSERT INTO users (id,firm_id,name,email,role,salt,password_hash,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(userId, firmId, name, email, "principal", pw.salt, pw.password_hash, 1, at)
  ]);
  return output({ ok: true, message: "Firm created. Sign in with your account." }, 201);
}
async function handleLogin(request, env) {
  const data = await bodyJSON(request);
  const email = clean(data.email, 200).toLowerCase(), password = String(data.password || "");
  const guard = await env.DB.prepare("SELECT failures,lock_until FROM login_attempts WHERE email=?").bind(email).first();
  if (guard && guard.lock_until && guard.lock_until > iso()) return fail("Too many attempts. Try again later.", 429);
  if (!validEmail(email) || password.length > 128) return fail("Invalid email or password",401);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(email).first();
  const match = user && equalConstant(await derivePassword(password, user.salt), user.password_hash);
  if (!match) {
    const count = (guard?.failures || 0) + 1;
    const lockUntil = count >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    await env.DB.prepare("INSERT INTO login_attempts(email,failures,lock_until) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET failures=excluded.failures,lock_until=excluded.lock_until")
      .bind(email, count, lockUntil).run();
    return fail("Invalid email or password", 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE email=?").bind(email).run();
  if(isPrivileged(user)){
    if(!env.MFA_ENCRYPTION_KEY)return fail("MFA deployment secret is not configured",503);
    return beginMfaChallenge(env,user,{output,hashToken,iso});
  }
  return issueSession(request,env,user,data.device_label);
}

async function issueSession(request,env,user,deviceLabel){
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,"0")).join("");
  const deviceId=id(),at=iso(),label=clean(deviceLabel,80)||"Browser session";
  const agent=clean(request.headers.get("User-Agent")||"Unknown browser",180);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO devices(id,firm_id,user_id,label,user_agent,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?)")
      .bind(deviceId,user.firm_id,user.id,label,agent,at,at),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,device_id,last_active_at) VALUES (?,?,?,?,?,?)")
      .bind(await hashToken(token),user.id,new Date(Date.now()+SESSION_DAYS*86400000).toISOString(),at,deviceId,at),
    await audit(env.DB,user,"signed_in","device",deviceId,{label})
  ]);
  const secure=new URL(request.url).protocol==="https:"?"; Secure":"";
  return output({ok:true},200,{"Set-Cookie":"chamber_session="+token+"; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800"+secure});
}
async function bootstrap(db, user) {
  const privileged = isPrivileged(user);
  const [firm, staff, clients, tasks, documents, activity, templates, enrollments, requirements] = await Promise.all([
    db.prepare("SELECT id,name FROM firms WHERE id=?").bind(user.firm_id).first(),
    db.prepare("SELECT id,name,email,role,active FROM users WHERE firm_id=? ORDER BY name").bind(user.firm_id).all(),
    (privileged
      ? db.prepare("SELECT * FROM clients WHERE firm_id=? AND archived_at IS NULL ORDER BY name").bind(user.firm_id)
      : db.prepare("SELECT DISTINCT c.id,c.name,c.category,c.email,c.phone,c.created_at,c.updated_at, NULL AS pan,NULL AS gstin,NULL AS notes FROM clients c JOIN tasks t ON c.id=t.client_id WHERE c.firm_id=? AND c.archived_at IS NULL AND t.firm_id=? AND t.assignee_id=? ORDER BY c.name").bind(user.firm_id,user.firm_id,user.id)).all(),
    (privileged
      ? db.prepare("SELECT * FROM tasks WHERE firm_id=? ORDER BY due_date ASC,created_at DESC LIMIT 2000").bind(user.firm_id)
      : db.prepare("SELECT * FROM tasks WHERE firm_id=? AND assignee_id=? ORDER BY due_date ASC,created_at DESC LIMIT 2000").bind(user.firm_id,user.id)).all(),
    (privileged
      ? db.prepare("SELECT * FROM documents WHERE firm_id=? ORDER BY updated_at DESC LIMIT 3000").bind(user.firm_id)
      : db.prepare("SELECT d.* FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id WHERE d.firm_id=? AND t.assignee_id=? ORDER BY d.updated_at DESC LIMIT 3000").bind(user.firm_id,user.id)).all(),
    (privileged
      ? db.prepare("SELECT a.*,u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.firm_id=? ORDER BY a.at DESC LIMIT 200").bind(user.firm_id)
      : db.prepare("SELECT a.*,u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.firm_id=? AND a.actor_id=? ORDER BY a.at DESC LIMIT 200").bind(user.firm_id,user.id)).all(),
    db.prepare("SELECT id,name,service,frequency,due_day,ask_by_lead_days,active FROM service_templates WHERE firm_id=? ORDER BY name").bind(user.firm_id).all(),
    (privileged?db.prepare("SELECT * FROM service_enrollments WHERE firm_id=?").bind(user.firm_id):db.prepare("SELECT * FROM service_enrollments WHERE firm_id=? AND assignee_id=?").bind(user.firm_id,user.id)).all(),
    db.prepare("SELECT id,template_id,name,required,sort_order FROM requirement_templates WHERE firm_id=? ORDER BY sort_order,name").bind(user.firm_id).all()
  ]);
  return output({ firm, user: { id:user.id, name:user.name, email:user.email, role:user.role },
    staff: staff.results, clients: clients.results, tasks: tasks.results,
    documents: documents.results, activity: activity.results, templates: templates.results, enrollments: enrollments.results,
    requirements: requirements.results });
}
async function validateFirmUser(db, firmId, userId) {
  if (!userId) return true;
  return !!(await db.prepare("SELECT id FROM users WHERE firm_id=? AND id=? AND active=1").bind(firmId,userId).first());
}
async function handleCreateClient(data, env, user) {
  if (!isPrivileged(user)) return fail("Insufficient permission",403);
  const name=clean(data.name,150),email=clean(data.email,200),category=clean(data.category||"Business",50);
  const pan=normalizeIdentifier(clean(data.pan,20)),gstin=normalizeIdentifier(clean(data.gstin,20));
  const phone=clean(data.phone,30),code=clean(data.code,40).toUpperCase(),group=clean(data.client_group,120);
  const manager=clean(data.manager_id,100);
  if(!name||(email&&!validEmail(email))||(pan&&!validPan(pan))||(gstin&&!validGstin(gstin))||
     !validClientPhone(phone)||(code&&!/^[-A-Z0-9_]+$/.test(code)))
    return fail("Check client name, email, PAN, GSTIN, phone and code");
  if(manager&&!(await validateFirmUser(env.DB,user.firm_id,manager)))return fail("Manager not found in firm");
  const duplicate=await env.DB.prepare("SELECT id FROM clients WHERE firm_id=? AND archived_at IS NULL AND ( (pan=? AND ?!='') OR (gstin=? AND ?!='') OR (code=? AND ?!='')) LIMIT 1")
    .bind(user.firm_id,pan,pan,gstin,gstin,code,code).first();
  if(duplicate)return fail("Duplicate client PAN, GSTIN or code",409);
  const clientId=id(),at=iso(),clientCode=code||"CL-"+clientId.slice(0,8).toUpperCase();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO clients(id,firm_id,name,category,pan,gstin,email,phone,notes,code,client_group,manager_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(clientId,user.firm_id,name,category,pan||null,gstin||null,email||null,phone||null,clean(data.notes,1000)||null,clientCode,group||null,manager||null,at,at),
    await audit(env.DB,user,"created","client",clientId)
  ]);
  return output({ id:clientId },201);
}
async function handleCreateTask(data, env, user) {
  if (!isPrivileged(user)) return fail("Insufficient permission",403);
  const clientId=clean(data.client_id,100), title=clean(data.title,180), service=clean(data.service,80);
  const client=await env.DB.prepare("SELECT id FROM clients WHERE firm_id=? AND id=?").bind(user.firm_id,clientId).first();
  if (!client || !title || !service) return fail("Valid client, title and service required");
  const assignee=clean(data.assignee_id,80), reviewer=clean(data.reviewer_id,80);
  if (!(await validateFirmUser(env.DB,user.firm_id,assignee)) || !(await validateFirmUser(env.DB,user.firm_id,reviewer))) return fail("Assignee or reviewer not found in firm");
  const due=clean(data.due_date,10);
  if (due && !validCalendarDate(due)) return fail("Due date must be a valid YYYY-MM-DD calendar date");
  const taskId=id(), at=iso();
  const priority=["low","medium","high"].includes(data.priority)?data.priority:"medium";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tasks(id,firm_id,client_id,title,service,period,due_date,ask_by_date,assignee_id,reviewer_id,priority,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(taskId,user.firm_id,clientId,title,service,clean(data.period,60),due||null,due?shiftCalendarDays(due,-10):null,assignee||null,reviewer||null,priority,"todo",clean(data.notes,2000),at,at),
    env.DB.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,at) VALUES(?,?,?,?,?,?,?)")
      .bind(id(),user.firm_id,taskId,user.id,null,"todo",at),
    await audit(env.DB,user,"created","task",taskId,{client_id:clientId})
  ]);
  return output({ id:taskId },201);
}
async function handleUpdateTask(taskId, data, env, user) {
  const previous=await env.DB.prepare("SELECT * FROM tasks WHERE firm_id=? AND id=?").bind(user.firm_id,taskId).first();
  if (!previous) return fail("Task not found",404);
  if (!isPrivileged(user) && (previous.assignee_id!==user.id || previous.status==="done")) return fail("Insufficient permission",403);
  const status=data.status===undefined?previous.status:safeStatus(data.status);
  if (!status || !statusForRole(user.role,status)) return fail("Status not permitted");
  const assignee=isPrivileged(user) && data.assignee_id!==undefined?clean(data.assignee_id,80):previous.assignee_id;
  if (!(await validateFirmUser(env.DB,user.firm_id,assignee))) return fail("Assignee not found in firm");
  const notes=data.notes===undefined?previous.notes:clean(data.notes,2000);
  const at=iso();
  const completed=status==="done"?(previous.completed_at||at):null;
  await env.DB.batch([
    env.DB.prepare("UPDATE tasks SET status=?,assignee_id=?,notes=?,updated_at=?,completed_at=?,completed_by=? WHERE id=? AND firm_id=?")
      .bind(status,assignee||null,notes,at,completed,status==="done"?(previous.completed_by||user.id):null,taskId,user.firm_id),
    env.DB.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,note,at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id(),user.firm_id,taskId,user.id,previous.status,status,assignee!==previous.assignee_id?"Assignee changed":null,at),
    await audit(env.DB,user,"updated","task",taskId,{from:previous.status,to:status,assignee_changed:assignee!==previous.assignee_id})
  ]);
  return output({ ok:true });
}
async function loadTaskForDocument(db,user,taskId) {
  const task=await db.prepare("SELECT id,client_id,assignee_id FROM tasks WHERE id=? AND firm_id=?").bind(taskId,user.firm_id).first();
  return task && (isPrivileged(user)||task.assignee_id===user.id)?task:null;
}
async function handleCreateDocument(data,env,user) {
  const taskId=clean(data.task_id,100), name=clean(data.name,180);
  const task=await loadTaskForDocument(env.DB,user,taskId);
  if (!task || !name) return fail("Valid assigned task and document name required",400);
  const docId=id(),at=iso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO documents(id,firm_id,task_id,client_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(docId,user.firm_id,taskId,task.client_id,name,"missing",at,at),
    await audit(env.DB,user,"created","document",docId,{task_id:taskId})
  ]);
  return output({ id:docId },201);
}
async function handleUpdateDocument(docId,data,env,user) {
  const previous=await env.DB.prepare("SELECT * FROM documents WHERE firm_id=? AND id=?").bind(user.firm_id,docId).first();
  if (!previous) return fail("Document not found",404);
  const task=await loadTaskForDocument(env.DB,user,previous.task_id);
  if (!task || (!isPrivileged(user) && previous.status==="verified")) return fail("Insufficient permission",403);
  const allowed=["missing","requested","received","verified","rejected","not_applicable"];
  const status=String(data.status||"");
  if (!allowed.includes(status)) return fail("Invalid document status");
  if (!isPrivileged(user) && ["verified","not_applicable"].includes(status)) return fail("Only managers can verify or waive a requirement",403);
  const at=iso();
  await env.DB.batch([
    env.DB.prepare("UPDATE documents SET status=?,requested_at=?,received_at=?,verified_at=?,updated_at=? WHERE id=? AND firm_id=?")
      .bind(status,status==="requested"?(previous.requested_at||at):previous.requested_at,status==="received"?(previous.received_at||at):previous.received_at,status==="verified"?at:null,at,docId,user.firm_id),
    await audit(env.DB,user,"updated","document",docId,{from:previous.status,to:status})
  ]);
  return output({ok:true});
}
async function handleCreateStaff(data,env,user) {
  if (user.role!=="principal") return fail("Only principals can add staff",403);
  const name=clean(data.name,100), email=clean(data.email,200).toLowerCase(), role=data.role==="manager"?"manager":"staff";
  const password=String(data.password||"");
  if(!name||!validEmail(email)||password.length<12||password.length>128) return fail("Name, valid email and password (12–128 characters) required");
  const pw=await passwordRecord(password), userId=id();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,firm_id,name,email,role,salt,password_hash,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(userId,user.firm_id,name,email,role,pw.salt,pw.password_hash,1,iso()),
      await audit(env.DB,user,"created","user",userId,{role})
    ]);
  } catch(e) {if(String(e).includes("UNIQUE"))return fail("Email already used",409);throw e;}
  return output({id:userId},201);
}
function calendarPeriod(ym, frequency) {
  const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return null;
  const year=Number(match[1]), month=Number(match[2]);
  if(year<2020||year>2100)return null;
  if(frequency==="monthly")return ym;
  if(frequency==="quarterly")return year+"-Q"+Math.ceil(month/3);
  if(frequency==="annual")return String(year);
  return null;
}
function plannedDueDate(ym,frequency,day) {
  const parts=ym.split("-").map(Number);
  const y=parts[0],m=parts[1],n=Math.max(1,Math.min(28,Number(day)||15));
  let date;
  if(frequency==="monthly")date=new Date(Date.UTC(y,m,n));
  else if(frequency==="quarterly")date=new Date(Date.UTC(y,Math.ceil(m/3)*3,n));
  else date=new Date(Date.UTC(y+1,0,n));
  return date.toISOString().slice(0,10);
}
async function handleCreateTemplate(data,env,user){
  if(!isPrivileged(user))return fail("Insufficient permission",403);
  const name=clean(data.name,120),service=clean(data.service,80),frequency=String(data.frequency||"");
  const day=Number(data.due_day);
  const lead=data.ask_by_lead_days===undefined?10:Number(data.ask_by_lead_days);
  if(!name||!service||!["monthly","quarterly","annual"].includes(frequency)||!Number.isInteger(day)||day<1||day>28||!Number.isInteger(lead)||lead<0||lead>90)return fail("Valid name, service, planning day (1–28) and ask-by lead (0–90) required");
  const templateId=id();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO service_templates(id,firm_id,name,service,frequency,due_day,ask_by_lead_days,active,created_at) VALUES (?,?,?,?,?,?,?,1,?)")
      .bind(templateId,user.firm_id,name,service,frequency,day,lead,iso()),
    await audit(env.DB,user,"created","template",templateId,{frequency})
  ]);
  return output({id:templateId},201);
}
async function handleEnroll(data,env,user){
  if(!isPrivileged(user))return fail("Insufficient permission",403);
  const clientId=clean(data.client_id,100),templateId=clean(data.template_id,100),assigneeId=clean(data.assignee_id,100);
  const [clientRecord,templateRecord,validUser]=await Promise.all([
    env.DB.prepare("SELECT id FROM clients WHERE firm_id=? AND id=?").bind(user.firm_id,clientId).first(),
    env.DB.prepare("SELECT id FROM service_templates WHERE firm_id=? AND id=? AND active=1").bind(user.firm_id,templateId).first(),
    validateFirmUser(env.DB,user.firm_id,assigneeId)
  ]);
  if(!clientRecord||!templateRecord||!validUser)return fail("Invalid client, template or assignee");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO service_enrollments(id,firm_id,client_id,template_id,assignee_id,active,created_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(firm_id,client_id,template_id) DO UPDATE SET assignee_id=excluded.assignee_id,active=1")
      .bind(id(),user.firm_id,clientId,templateId,assigneeId||null,iso()),
    await audit(env.DB,user,"enrolled","template",templateId,{client_id:clientId})
  ]);
  return output({ok:true},201);
}
async function generatePeriod(db,ym,firmId=null,actorId=null) {
  if(!calendarPeriod(ym,"monthly"))throw Error("Invalid work period");
  const query=firmId
    ?db.prepare("SELECT e.firm_id,e.client_id,e.assignee_id,t.id AS template_id,t.name,t.service,t.frequency,t.due_day,t.ask_by_lead_days FROM service_enrollments e JOIN service_templates t ON t.id=e.template_id AND t.firm_id=e.firm_id WHERE e.firm_id=? AND e.active=1 AND t.active=1 LIMIT 2000").bind(firmId)
    :db.prepare("SELECT e.firm_id,e.client_id,e.assignee_id,t.id AS template_id,t.name,t.service,t.frequency,t.due_day,t.ask_by_lead_days FROM service_enrollments e JOIN service_templates t ON t.id=e.template_id AND t.firm_id=e.firm_id WHERE e.active=1 AND t.active=1 LIMIT 2000");
  const records=(await query.all()).results;
  let created=0,already=0;
  const requirementCache=new Map();
  for(const row of records) {
    const period=calendarPeriod(ym,row.frequency);
    const exists=await db.prepare("SELECT id FROM recurrence_runs WHERE firm_id=? AND template_id=? AND client_id=? AND period=?").bind(row.firm_id,row.template_id,row.client_id,period).first();
    if(exists){already++;continue;}
    const taskId=id(),at=iso();
    const override=await db.prepare("SELECT new_due_date FROM due_date_overrides WHERE firm_id=? AND template_id=? AND period=?")
      .bind(row.firm_id,row.template_id,period).first();
    const due=override?.new_due_date||plannedDueDate(ym,row.frequency,row.due_day);
    const askBy=shiftCalendarDays(due,-Number(row.ask_by_lead_days));
    const cacheKey=row.firm_id+":"+row.template_id;
    if(!requirementCache.has(cacheKey)) {
      const result=await db.prepare("SELECT id,name FROM requirement_templates WHERE firm_id=? AND template_id=? AND required=1 ORDER BY sort_order,id")
        .bind(row.firm_id,row.template_id).all();
      requirementCache.set(cacheKey,result.results);
    }
    const checklist=requirementCache.get(cacheKey);
    try {
      await db.batch([
        db.prepare("INSERT INTO tasks(id,firm_id,client_id,title,service,period,due_date,ask_by_date,assignee_id,priority,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(taskId,row.firm_id,row.client_id,row.name,row.service,period,due,askBy,row.assignee_id||null,"medium","todo","Planning date only; verify statutory filing dates separately.",at,at),
        db.prepare("INSERT INTO recurrence_runs(id,firm_id,template_id,client_id,period,task_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(id(),row.firm_id,row.template_id,row.client_id,period,taskId,at),
        db.prepare("INSERT INTO task_events(id,firm_id,task_id,actor_id,from_status,to_status,at) VALUES(?,?,?,?,?,?,?)")
          .bind(id(),row.firm_id,taskId,actorId||null,null,"todo",at),
        ...checklist.map(req=>db.prepare("INSERT INTO documents(id,firm_id,task_id,client_id,name,status,requirement_template_id,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?,?)")
          .bind(id(),row.firm_id,taskId,row.client_id,req.name,req.id,at,at)),
        db.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id(),row.firm_id,actorId||null,actorId?"generated":"system_generated","task",taskId,JSON.stringify({period,template_id:row.template_id,items:checklist.length}),at)
      ]);
      created++;
    }catch(error){
      if(/UNIQUE|constraint failed/.test(String(error)))already++;
      else throw error;
    }
  }
  return {created,already,checked:records.length};
}
async function handleGenerate(data,env,user){
  if(!isPrivileged(user))return fail("Insufficient permission",403);
  const period=clean(data.period,7);
  if(!calendarPeriod(period,"monthly"))return fail("Period must be YYYY-MM");
  const result=await generatePeriod(env.DB,period,user.firm_id,user.id);
  return output(result);
}

async function handleExport(request,env,user) {
  if (!isPrivileged(user)) return fail("Insufficient permission",403);
  const kind=new URL(request.url).searchParams.get("kind");
  const columns={
    clients:["id","name","category","email","phone","created_at"],
    tasks:["id","client_id","title","service","period","due_date","assignee_id","status","priority","updated_at"],
    documents:["id","task_id","name","status","requested_at","received_at","verified_at"]
  };
  if(!columns[kind])return fail("Unknown export type");
  const rows=await env.DB.prepare("SELECT "+columns[kind].join(",")+" FROM "+kind+" WHERE firm_id=? ORDER BY created_at DESC LIMIT 10000".replace(kind==="documents"?"created_at DESC":"no-sentinel",kind==="documents"?"updated_at DESC":"no-sentinel")).bind(user.firm_id).all();
  await (await audit(env.DB,user,"exported","data",kind,{rows:rows.results.length})).run();
  const csv=[columns[kind].join(","),...rows.results.map(row=>columns[kind].map(key=>csvCell(row[key])).join(","))].join("\r\n");
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=chamber-"+kind+".csv","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
async function api(request,env) {
  if (!env.DB) return fail("Database binding missing",503);
  const url=new URL(request.url), path=url.pathname, method=request.method.toUpperCase();
  if(method!=="GET"&&method!=="HEAD"&&!assertOrigin(request)) return fail("Invalid request origin",403);
  try {
    if(path==="/api/health"&&method==="GET") return output({ok:true});
    if(path==="/api/session"&&method==="GET") {
      const user=await sessionFor(request,env.DB);
      const hasUser=await env.DB.prepare("SELECT id FROM users LIMIT 1").first();
      return output({authenticated:!!user,needs_setup:!hasUser,user:user?{id:user.id,name:user.name,role:user.role}:null});
    }
    if(path==="/api/setup"&&method==="POST") return handleSetup(request,env);
    if(path==="/api/login"&&method==="POST") return handleLogin(request,env);
    if(path==="/api/mfa/setup"||path==="/api/mfa/verify")
      return handleMfa(request,env,{output,fail,bodyJSON,hashToken,issueSession,iso,audit});
    const user=await sessionFor(request,env.DB);
    if(!user) return fail("Sign in required",401);
    if(path==="/api/logout"&&method==="POST"){
      const token=(request.headers.get("Cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("chamber_session="));
      if(token) await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hashToken(token.split("=")[1])),
        await audit(env.DB,user,"signed_out","session",user.id)
      ]);
      return output({ok:true},200,{"Set-Cookie":"chamber_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"});
    }
    if(path==="/api/bootstrap"&&method==="GET") return bootstrap(env.DB,user);
    if(path==="/api/devices"&&method==="GET"){
      const principal=user.role==="principal";
      const devices=(await env.DB.prepare("SELECT d.id,d.label,d.user_agent,d.first_seen_at,d.last_seen_at,d.trusted,d.revoked_at,d.user_id,u.name AS user_name FROM devices d JOIN users u ON u.id=d.user_id AND u.firm_id=d.firm_id WHERE d.firm_id=? "+(principal?"":"AND d.user_id=? ")+"ORDER BY d.last_seen_at DESC LIMIT 300")
       .bind(...(principal?[user.firm_id]:[user.firm_id,user.id])).all()).results;
      return output({devices,current_device_id:user.device_id??null});
    }
    const revoke=path.match(/^\/api\/devices\/([a-f0-9-]+)\/revoke$/);
    if(revoke&&method==="POST"){
      const d=await env.DB.prepare("SELECT id,user_id,revoked_at FROM devices WHERE id=? AND firm_id=?").bind(revoke[1],user.firm_id).first();
      if(!d)return fail("Device not found",404);
      if(user.role!=="principal"&&d.user_id!==user.id)return fail("Insufficient permission",403);
      if(d.revoked_at)return fail("Device already revoked",409);
      await env.DB.batch([
       env.DB.prepare("UPDATE devices SET revoked_at=? WHERE id=? AND firm_id=?").bind(iso(),d.id,user.firm_id),
       env.DB.prepare("DELETE FROM sessions WHERE device_id=?").bind(d.id),
       await audit(env.DB,user,"revoked","device",d.id,{user_id:d.user_id})
      ]);
      return output({ok:true});
    }
    if(path==="/api/clients"&&method==="POST") return handleCreateClient(await bodyJSON(request),env,user);
    if(/^\/api\/clients\/[a-f0-9-]+(?:\/(?:profile|contacts|gstins|archive))?$/.test(path))
      return handleClientMaster(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail});
    if(path==="/api/tasks"&&method==="POST") return handleCreateTask(await bodyJSON(request),env,user);
    if(path==="/api/documents"&&method==="POST") return handleCreateDocument(await bodyJSON(request),env,user);
    if(path==="/api/staff"&&method==="POST") return handleCreateStaff(await bodyJSON(request),env,user);
    if(path==="/api/templates"&&method==="POST") return handleCreateTemplate(await bodyJSON(request),env,user);
    if(path==="/api/enrollments"&&method==="POST") return handleEnroll(await bodyJSON(request),env,user);
    if(path==="/api/recurrence"&&method==="POST") return handleGenerate(await bodyJSON(request),env,user);
    if(path==="/api/export"&&method==="GET") return handleExport(request,env,user);
    if(path==="/api/files"||path.startsWith("/api/files/"))return handleFiles(request,env,user,{output,fail,clean,audit,id,iso});
    if(path.startsWith("/api/sheets/"))return handleSheetSettings(request,env,user,{output,fail,clean,audit,id,iso,bodyJSON});
    if(path.startsWith("/api/reports/"))return handleReports(request,env,user,{output,fail,isPrivileged});
    if(path.startsWith("/api/messages/"))
      return handleMessages(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail});
    if(path==="/api/reminders"||path.startsWith("/api/reminders/"))
      return handleReminderApi(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON});
    if(path==="/api/imports"||path.startsWith("/api/imports/"))
      return handleImports(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail,csvCell});
    if(path==="/api/workload" || /^\/api\/tasks\/[a-f0-9-]+\/(?:assignment|review|comments|timer|time)$/.test(path))
      return handleWork(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validateFirmUser});
    if(["/api/requirements","/api/overrides","/api/tracker","/api/tracker/detail","/api/inward"].includes(path) ||
       /^\/api\/tasks\/[a-f0-9-]+\/history$/.test(path))
      return handleWorkflow(request,env,user,{output,fail,clean,audit,id,iso,isPrivileged,bodyJSON});
    const taskMatch=path.match(/^\/api\/tasks\/([a-f0-9-]+)$/);
    if(taskMatch&&method==="PATCH") return handleUpdateTask(taskMatch[1],await bodyJSON(request),env,user);
    const docMatch=path.match(/^\/api\/documents\/([a-f0-9-]+)$/);
    if(docMatch&&method==="PATCH") return handleUpdateDocument(docMatch[1],await bodyJSON(request),env,user);
    return fail("Not found",404);
  } catch(e) {
    if(e instanceof SyntaxError || /Request too large|JSON content type required|Expected an object/.test(String(e.message))) return fail("Invalid JSON request: "+e.message,400);
    console.error("Chamber API error",e?.message || "unknown");
    return fail("Server error",500);
  }
}
export default {
  async scheduled(controller,env,ctx) {
    if(!env.DB)return;
    if(controller.cron==="*/1 * * * *"){
      ctx.waitUntil(scheduledSheetSync(env).catch(error=>console.error("Chamber Sheets sync failed",error?.message)));
      return;
    }
    const now=new Date();
    const months=[0,1,2].map(i=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+i,1)).toISOString().slice(0,7));
    ctx.waitUntil((async()=>{
      for(const month of months)await generatePeriod(env.DB,month);
      await refreshReminderSuggestions(env.DB);
    })().catch(error=>console.error("Chamber daily workflow failed",error.message)));
  },
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(path==="/api/file-scan/callback")return scanCallback(request,env);
    if(path.startsWith("/api/")) return api(request,env);
    if(!env.ASSETS) return fail("Static assets missing",503);
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set("X-Content-Type-Options","nosniff");
    headers.set("Referrer-Policy","strict-origin-when-cross-origin");
    headers.set("X-Frame-Options","DENY");
    headers.set("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
};