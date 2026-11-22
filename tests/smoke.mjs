import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
function otpCode(secret){
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits=0,buffer=0,bytes=[];
 for(const char of secret){buffer=(buffer<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bytes.push((buffer>>(bits-8))&255);bits-=8}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hmac=createHmac("sha1",Buffer.from(bytes)).update(counter).digest(),offset=hmac[19]&15;
 const code=(hmac.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(code).padStart(6,"0");
}
import { gstinCheckCharacter } from "../src/client-validation.js";

const base = "http://127.0.0.1:8787";
let principalCookie = "";
async function call(path, method = "GET", data, cookie = principalCookie, extra = {}) {
  const headers = { ...extra };
  if (method !== "GET") headers.Origin = base;
  if (cookie) headers.Cookie = cookie;
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  const type = res.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await res.json() : await res.text();
  return { res, body };
}
const ok = value => { assert.ok(value.res.ok, JSON.stringify(value.body)); return value.body; };
const session = await call("/api/session");
assert.equal(ok(session).needs_setup, true);
const setup = await call("/api/setup", "POST", { firm:"Test CA & Co.", name:"Test Principal", email:"principal@example.test", password:"strong-password-123" }, "", { "X-Setup-Token":"test-setup-token-123456789" });
assert.equal(setup.res.status, 201);
const retry = await call("/api/setup", "POST", { firm:"Second Firm", name:"Fake", email:"other@example.test", password:"strong-password-123" }, "", { "X-Setup-Token":"test-setup-token-123456789" });
assert.equal(retry.res.status, 409);
const login=await call("/api/login","POST",{email:"principal@example.test",password:"strong-password-123",device_label:"Test office PC"},"");
assert.equal(login.body.requires_mfa,true);
assert.equal(login.body.enrollment_required,true);
assert.equal(login.res.headers.get("set-cookie"),null,"Password alone must never issue a privileged session");
const mfaSecret=ok(await call("/api/mfa/setup","POST",{challenge:login.body.challenge},""));
assert.ok(mfaSecret.secret);
assert.ok(mfaSecret.otpauth_uri.startsWith("otpauth://"));
const actualOtp=otpCode(mfaSecret.secret);
const badOtp=actualOtp.slice(0,5)+(actualOtp.at(-1)==="9"?"0":String(Number(actualOtp.at(-1))+1));
const invalidMfa=await call("/api/mfa/verify","POST",{challenge:login.body.challenge,code:badOtp,device_label:"Test office PC"},"");
assert.equal(invalidMfa.res.status,401);
const mfaVerify=await call("/api/mfa/verify","POST",{challenge:login.body.challenge,code:actualOtp,device_label:"Test office PC"},"");
ok(mfaVerify);
principalCookie=mfaVerify.res.headers.get("set-cookie").split(";")[0];
assert.ok(principalCookie.startsWith("chamber_session="));
const replay=await call("/api/mfa/verify","POST",{challenge:login.body.challenge,code:actualOtp},"");
assert.equal(replay.res.status,401,"MFA challenge must be one-time");
assert.ok(principalCookie.startsWith("chamber_session="));
assert.equal(ok(await call("/api/bootstrap")).clients.length, 0);

const clientA = ok(await call("/api/clients","POST",{name:"Shah & Co.",category:"Partnership",email:"accounts@example.test"}));
const clientB = ok(await call("/api/clients","POST",{name:"Hidden Client",category:"Business"}));
const staff = ok(await call("/api/staff","POST",{name:"Aarav Kumar",email:"aarav@example.test",password:"strong-staff-password",role:"staff"}));
const task = ok(await call("/api/tasks","POST",{client_id:clientA.id,title:"GST Return",service:"GST",period:"Oct 2026",due_date:"2026-11-20",assignee_id:staff.id,priority:"high"}));
const document = ok(await call("/api/documents","POST",{task_id:task.id,name:"Sales invoices"}));
let snap = ok(await call("/api/bootstrap"));
assert.equal(snap.clients.length, 2);
assert.equal(snap.tasks.length, 1);
assert.equal(snap.documents.length, 1);
assert.equal(snap.tasks[0].status, "todo");

const staffLogin = await call("/api/login","POST",{email:"aarav@example.test",password:"strong-staff-password"},"");
ok(staffLogin);
const staffCookie = staffLogin.res.headers.get("set-cookie").split(";")[0];
snap = ok(await call("/api/bootstrap","GET",undefined,staffCookie));
assert.equal(snap.clients.length, 1, "Staff must only see clients with their assigned tasks");
assert.equal(snap.clients[0].id, clientA.id);
assert.equal(snap.clients[0].pan, null, "Staff response must not contain PAN");
assert.equal(snap.clients[0].gstin, null, "Staff response must not contain GSTIN");
assert.equal(snap.clients[0].notes, null, "Staff response must not contain private notes");
const createdByStaff = await call("/api/clients","POST",{name:"Unauthorised"} ,staffCookie);
assert.equal(createdByStaff.res.status,403);
ok(await call("/api/tasks/"+task.id,"PATCH",{status:"in_progress"},staffCookie));
const doneByStaff = await call("/api/tasks/"+task.id,"PATCH",{status:"done"},staffCookie);
assert.notEqual(doneByStaff.res.status,200);
const verifyByStaff = await call("/api/documents/"+document.id,"PATCH",{status:"verified"},staffCookie);
assert.equal(verifyByStaff.res.status,403);

ok(await call("/api/documents/"+document.id,"PATCH",{status:"received"}));
ok(await call("/api/documents/"+document.id,"PATCH",{status:"verified"}));
ok(await call("/api/tasks/"+task.id,"PATCH",{status:"done"}));
snap = ok(await call("/api/bootstrap"));
assert.equal(snap.tasks[0].status,"done");
assert.equal(snap.documents[0].status,"verified");
assert.ok(snap.activity.length >= 7);
const csv = await call("/api/export?kind=clients");
assert.equal(csv.res.status,200);
assert.ok(csv.body.includes("Shah & Co."));
snap = ok(await call("/api/bootstrap"));
assert.ok(snap.activity.some(e => e.event === "signed_in"), "Sign-in must be logged");
assert.ok(snap.activity.some(e => e.event === "exported"), "Export must be logged");

const template = ok(await call("/api/templates","POST",{name:"Monthly GST return",service:"GST",frequency:"monthly",due_day:15}));
const requirement=ok(await call("/api/requirements","POST",{template_id:template.id,name:"Sales register",sort_order:1}));
assert.ok(requirement.id);
ok(await call("/api/enrollments","POST",{client_id:clientA.id,template_id:template.id,assignee_id:staff.id}));
const generated = ok(await call("/api/recurrence","POST",{period:"2026-11"}));
assert.equal(generated.created,1);
const repeated = ok(await call("/api/recurrence","POST",{period:"2026-11"}));
assert.equal(repeated.created,0);
assert.equal(repeated.already,1);
const nextPeriod = ok(await call("/api/recurrence","POST",{period:"2026-12"}));
assert.equal(nextPeriod.created,1);
snap=ok(await call("/api/bootstrap"));
assert.equal(snap.templates.length,1);
assert.equal(snap.enrollments.length,1);
assert.equal(snap.tasks.filter(t=>t.title==="Monthly GST return").length,2);
assert.equal(snap.tasks.find(t=>t.period==="2026-11")?.due_date,"2026-12-15");
assert.equal(snap.tasks.find(t=>t.period==="2026-11")?.ask_by_date,"2026-12-05");
const tracker=ok(await call("/api/tracker?from=2026-04"));
assert.equal(tracker.periods.length,12);
assert.equal(tracker.clients.find(c=>c.id===clientA.id).cells.find(c=>c.period==="2026-11").state,"missing");
const detail=ok(await call("/api/tracker/detail?client_id="+clientA.id+"&period=2026-11"));
assert.equal(detail.documents.length,1);
const receipt=ok(await call("/api/inward","POST",{client_id:clientA.id,period:"2026-11",document_ids:[detail.documents[0].id],received_via:"email"}));
assert.equal(receipt.received,1);
const afterReceipt=ok(await call("/api/tracker?from=2026-04"));
assert.equal(afterReceipt.clients.find(c=>c.id===clientA.id).cells.find(c=>c.period==="2026-11").state,"complete");
const override=ok(await call("/api/overrides","POST",{template_id:template.id,period:"2026-11",new_due_date:"2026-12-19",source_reference:"Test extension"}));
assert.equal(override.updated_tasks,1);
snap=ok(await call("/api/bootstrap"));
assert.equal(snap.tasks.find(t=>t.period==="2026-11")?.due_date,"2026-12-19");
assert.equal(snap.tasks.find(t=>t.period==="2026-11")?.ask_by_date,"2026-12-09");
const taskHistory=ok(await call("/api/tasks/"+task.id+"/history"));
assert.ok(taskHistory.events.length>=2);

const reviewTask=ok(await call("/api/tasks","POST",{
  client_id:clientA.id,title:"Review readiness",service:"Audit",
  period:"2026-11",due_date:"2026-12-20",assignee_id:staff.id,reviewer_id:undefined
}));
const tId=reviewTask.id;
ok(await call("/api/tasks/"+tId+"/assignment","PATCH",{assignee_id:staff.id,reviewer_id:staff.id}));
const comment=ok(await call("/api/tasks/"+tId+"/comments","POST",{body:"Work started."},staffCookie));
assert.ok(comment.id);
const historyComments=ok(await call("/api/tasks/"+tId+"/comments","GET",undefined,staffCookie));
assert.equal(historyComments.comments.length,1);
ok(await call("/api/tasks/"+tId+"/timer","POST",{action:"start"},staffCookie));
const stopped=ok(await call("/api/tasks/"+tId+"/timer","POST",{action:"stop"},staffCookie));
assert.ok(stopped.minutes>=1);
const timeLog=ok(await call("/api/tasks/"+tId+"/time","GET",undefined,staffCookie));
assert.equal(timeLog.entries.length,1);
ok(await call("/api/tasks/"+tId,"PATCH",{status:"review"},staffCookie));
const approved=ok(await call("/api/tasks/"+tId+"/review","POST",{decision:"approve",note:"Reviewed"}));
assert.equal(approved.status,"done");
const members=ok(await call("/api/workload"));
assert.ok(members.members.some(m=>m.id===staff.id));
const deniedWorkload=await call("/api/workload","GET",undefined,staffCookie);
assert.equal(deniedWorkload.res.status,403);
const pan="ABCDE1234F";
const gstinBase="24ABCDE1234F1Z",gstin=gstinBase+gstinCheckCharacter(gstinBase);
ok(await call("/api/clients/"+clientA.id,"PATCH",{code:"CL-TEST",pan,client_group:"Shah Group"}));
const profile=ok(await call("/api/clients/"+clientA.id+"/profile"));
assert.equal(profile.client.pan,pan);
assert.equal(profile.client.code,"CL-TEST");
const addedContact=ok(await call("/api/clients/"+clientA.id+"/contacts","POST",{
  name:"Accounts Team",email:"accounts2@example.test",phone:"+919876543210",
  preferred_channel:"whatsapp",whatsapp_opt_in:true,whatsapp_opt_in_source:"Direct written authorization"
}));
assert.ok(addedContact.id);
const registration=ok(await call("/api/clients/"+clientA.id+"/gstins","POST",{gstin}));
assert.ok(registration.id);
const full=ok(await call("/api/clients/"+clientA.id+"/profile"));
assert.equal(full.contacts.length,1);
assert.equal(full.gstins.length,1);
const visibleToStaff=ok(await call("/api/clients/"+clientA.id+"/profile","GET",undefined,staffCookie));
assert.equal(visibleToStaff.client.pan,undefined);
assert.equal(visibleToStaff.gstins.length,0);
const deniedEdit=await call("/api/clients/"+clientA.id,"PATCH",{name:"Not permitted"},staffCookie);
assert.equal(deniedEdit.res.status,403);
const duplicateClient=await call("/api/clients","POST",{name:"Duplicate PAN",pan});
assert.equal(duplicateClient.res.status,409);
ok(await call("/api/clients/"+clientB.id+"/archive","POST",{}));
snap=ok(await call("/api/bootstrap"));
assert.equal(snap.clients.some(c=>c.id===clientB.id),false);
const importBatch=ok(await call("/api/imports","POST",{kind:"clients"}));
const clientRows=[
 {source_index:2,name:"Imported Account",code:"CL-IMPORT",email:"imported@example.test",category:"Business"},
 {source_index:3,name:"Invalid Client",pan:"NOTVALID"}
];
const preflight=ok(await call("/api/imports/validate","POST",{rows:clientRows}));
assert.equal(preflight.accepted,1);
assert.equal(preflight.rejected,1);
const imported=ok(await call("/api/imports/"+importBatch.id+"/rows","POST",{rows:clientRows}));
assert.equal(imported.accepted,1);
assert.equal(imported.rejected.length,1);
const repeat=ok(await call("/api/imports/"+importBatch.id+"/rows","POST",{rows:clientRows}));
assert.equal(repeat.already,1);
const completedImport=ok(await call("/api/imports/"+importBatch.id+"/complete","POST",{}));
assert.equal(completedImport.imported,1);
const errorReport=await call("/api/imports/"+importBatch.id+"/errors");
assert.equal(errorReport.res.status,200);
assert.ok(errorReport.body.includes("Invalid PAN"));
snap=ok(await call("/api/bootstrap"));
assert.ok(snap.clients.some(c=>c.code==="CL-IMPORT"));
ok(await call("/api/imports/"+importBatch.id+"/undo","POST",{}));
snap=ok(await call("/api/bootstrap"));
assert.equal(snap.clients.some(c=>c.code==="CL-IMPORT"),false);
const dashboard=ok(await call("/api/reports/dashboard"));
assert.ok(dashboard.team_count>=2);
assert.ok(Array.isArray(dashboard.deadlines));
for(const kind of ["due_soon","overdue","missing","unassigned","review","waiting"]){
 const report=ok(await call("/api/reports/drilldown?kind="+kind));
 assert.equal(report.total,dashboard.kpis[kind],"Every KPI must equal its drilldown total");
}
const deniedDashboard=await call("/api/reports/dashboard","GET",undefined,staffCookie);
assert.equal(deniedDashboard.res.status,403);
// Reminder engine produces staff-reviewed suggestions, never outbound messages.
const reminderDue=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const reminderTask=ok(await call("/api/tasks","POST",{
 client_id:clientA.id,title:"Reminder workflow test",service:"GST",period:"2026-10",due_date:reminderDue,assignee_id:staff.id
}));
const reminderDocument=ok(await call("/api/documents","POST",{task_id:reminderTask.id,name:"Purchase register"}));
const disabledReminder=ok(await call("/api/reminders/config"));
assert.equal(disabledReminder.config.enabled,0);
const deniedPolicy=await call("/api/reminders/config","GET",undefined,staffCookie);
assert.equal(deniedPolicy.res.status,403);
ok(await call("/api/reminders/config","PUT",{
 enabled:true,ask_days:10,remind_days:6,escalate_days:3,max_reminders:4,quiet_start:"21:00",quiet_end:"08:00"
}));
const reminderFirst=ok(await call("/api/reminders/refresh","POST",{}));
assert.equal(reminderFirst.delivery_enabled,false);
assert.ok(reminderFirst.result.created>=1);
const pendingReminders=ok(await call("/api/reminders?status=pending"));
const pending=pendingReminders.items.find(x=>x.client_id===clientA.id&&x.period==="2026-10");
assert.ok(pending,"A client with outstanding information should have a reminder");
assert.equal(pending.stage,"remind");
const reminderAgain=ok(await call("/api/reminders/refresh","POST",{}));
assert.equal(reminderAgain.result.created,0,"The scheduler must be idempotent");
const fakeBatch=await call("/api/reminders/"+pending.id+"/prepared","POST",{batch_id:"00000000-0000-0000-0000-000000000001"});
assert.equal(fakeBatch.res.status,400,"A prepared reminder must match a saved request draft");
const pauseDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
ok(await call("/api/reminders/clients/"+clientA.id+"/pause","POST",{paused_until:pauseDate,reason:"Client requested a pause"}));
const paused=ok(await call("/api/reminders?status=pending"));
assert.equal(paused.items.find(x=>x.id===pending.id).paused_until,pauseDate);
ok(await call("/api/reminders/clients/"+clientA.id+"/resume","POST",{}));
ok(await call("/api/documents/"+reminderDocument.id,"PATCH",{status:"received"}));
const resolvedReminder=ok(await call("/api/reminders/refresh","POST",{}));
assert.ok(resolvedReminder.result.resolved>=1);
const resolvedFeed=ok(await call("/api/reminders?status=resolved"));
assert.ok(resolvedFeed.items.some(x=>x.id===pending.id));
// Manager isolation: team-owned clients may be accessed; unrelated clients must remain hidden.
const teamManager=ok(await call("/api/staff","POST",{
  name:"Test Manager",email:"manager@example.test",password:"manager-strong-password-123",role:"manager"
}));
const reportStaff=ok(await call("/api/staff","POST",{
  name:"Managed Article",email:"article@example.test",password:"article-strong-password-123",role:"staff",manager_id:teamManager.id
}));
const otherStaff=ok(await call("/api/staff","POST",{
  name:"Separate Staff",email:"other-staff@example.test",password:"other-strong-password-123",role:"staff"
}));
const managedClient=ok(await call("/api/clients","POST",{name:"Manager Team Client",manager_id:teamManager.id,email:"managed@example.test"}));
const privateClient=ok(await call("/api/clients","POST",{name:"Other Team Confidential",email:"separate@example.test"}));
const managedTask=ok(await call("/api/tasks","POST",{
  client_id:managedClient.id,title:"Manager Team GST",service:"GST",period:"2026-11",due_date:"2026-12-29",
  assignee_id:reportStaff.id
}));
const privateTask=ok(await call("/api/tasks","POST",{
  client_id:privateClient.id,title:"Other Team Audit",service:"Audit",period:"2026-11",due_date:"2026-12-30",
  assignee_id:otherStaff.id
}));
const managedDocument=ok(await call("/api/documents","POST",{task_id:managedTask.id,name:"Purchase invoices"}));
ok(await call("/api/documents","POST",{task_id:privateTask.id,name:"Confidential private ledger"}));
const passwordManager=await call("/api/login","POST",{email:"manager@example.test",password:"manager-strong-password-123"},"");
assert.equal(passwordManager.body.requires_mfa,true);
const managerSecret=ok(await call("/api/mfa/setup","POST",{challenge:passwordManager.body.challenge},""));
const verifiedManager=await call("/api/mfa/verify","POST",{
  challenge:passwordManager.body.challenge,code:otpCode(managerSecret.secret),device_label:"Manager office PC"
},"");
ok(verifiedManager);
const managerCookie=verifiedManager.res.headers.get("set-cookie").split(";")[0];
const managerSnapshot=ok(await call("/api/bootstrap","GET",undefined,managerCookie));
assert.ok(managerSnapshot.clients.some(c=>c.id===managedClient.id));
assert.equal(managerSnapshot.clients.some(c=>c.id===privateClient.id),false);
assert.equal(managerSnapshot.tasks.some(t=>t.id===privateTask.id),false);
assert.equal(managerSnapshot.documents.some(d=>d.client_id===privateClient.id),false);
const managerProfile=ok(await call("/api/clients/"+managedClient.id+"/profile","GET",undefined,managerCookie));
assert.equal(managerProfile.client.id,managedClient.id);
assert.equal((await call("/api/clients/"+privateClient.id+"/profile","GET",undefined,managerCookie)).res.status,403);
assert.equal((await call("/api/tasks","POST",{client_id:privateClient.id,title:"Unauthorized",service:"Audit"},managerCookie)).res.status,400);
assert.equal((await call("/api/tasks/"+privateTask.id,"PATCH",{status:"done"},managerCookie)).res.status,403);
assert.equal((await call("/api/tasks/"+privateTask.id+"/comments","GET",undefined,managerCookie)).res.status,404);
assert.equal((await call("/api/tracker/detail?client_id="+privateClient.id+"&period=2026-11","GET",undefined,managerCookie)).res.status,404);
assert.equal((await call("/api/inward","POST",{
  client_id:privateClient.id,period:"2026-11",document_ids:[managedDocument.id]
},managerCookie)).res.status,404);
assert.equal((await call("/api/export?kind=clients","GET",undefined,managerCookie)).res.status,403);
assert.equal((await call("/api/imports","GET",undefined,managerCookie)).res.status,403);
assert.equal((await call("/api/reminders/refresh","POST",{},managerCookie)).res.status,403);
assert.equal((await call("/api/templates","POST",{
  name:"Unapproved global template",service:"GST",frequency:"monthly",due_day:15
},managerCookie)).res.status,403);
assert.equal((await call("/api/tasks/"+managedTask.id+"/assignment","PATCH",{
  assignee_id:otherStaff.id
},managerCookie)).res.status,403);
const managerNewClient=ok(await call("/api/clients","POST",{name:"Manager Added Company"},managerCookie));
const ownedProfile=ok(await call("/api/clients/"+managerNewClient.id+"/profile","GET",undefined,managerCookie));
assert.equal(ownedProfile.client.manager_id,teamManager.id);
const trackerForManager=ok(await call("/api/tracker?from=2026-04","GET",undefined,managerCookie));
assert.ok(trackerForManager.clients.some(c=>c.id===managedClient.id));
assert.equal(trackerForManager.clients.some(c=>c.id===privateClient.id),false);
const managerDashboard=ok(await call("/api/reports/dashboard","GET",undefined,managerCookie));
const managerWork=ok(await call("/api/reports/drilldown?kind=missing","GET",undefined,managerCookie));
assert.equal(managerDashboard.kpis.missing,managerWork.total);
assert.equal(managerWork.rows.some(r=>r.client_id===privateClient.id),false);
const managerPreview=ok(await call("/api/messages/preview","POST",{
  channel:"email",period:"2026-11",client_ids:[managedClient.id,privateClient.id]
},managerCookie));
assert.equal(managerPreview.previews.find(p=>p.client_id===privateClient.id).eligible,false);
const deniedSecurity=await call("/api/security/events","GET",undefined,staffCookie);
assert.equal(deniedSecurity.res.status,403);
const failedKnownLogin=await call("/api/login","POST",{
 email:"aarav@example.test",password:"incorrect-password"
},"");
assert.equal(failedKnownLogin.res.status,401);
const securityFeed=ok(await call("/api/security/events"));
assert.ok(securityFeed.total>=4);
assert.ok(securityFeed.events.some(e=>e.event==="signed_in"));
assert.ok(securityFeed.events.some(e=>e.event==="exported"));
assert.ok(securityFeed.events.some(e=>e.event==="access_denied"));
assert.ok(securityFeed.events.some(e=>e.event==="sign_in_failed"));
assert.ok(securityFeed.events.some(e=>e.event==="mfa_verified"));
assert.ok(securityFeed.events.every(e=>!JSON.stringify(e).includes("strong-password-123")));
assert.ok(securityFeed.events.every(e=>!JSON.stringify(e).includes("otpauth://")));
const filteredSecurity=ok(await call("/api/security/events?event=access_denied"));
assert.equal(filteredSecurity.events.every(e=>e.event==="access_denied"),true);
const initialOnboarding=ok(await call("/api/onboarding"));
assert.ok(initialOnboarding.counts.users>=2);
assert.ok(initialOnboarding.counts.clients>=2);
assert.ok(initialOnboarding.stages.clients);
assert.ok(initialOnboarding.stages.services);
assert.ok(initialOnboarding.stages.first_tasks);
assert.equal(initialOnboarding.security.mfa_enabled,true);
assert.equal(initialOnboarding.integrations.email.connected,false);
assert.equal(initialOnboarding.integrations.whatsapp.connected,false);
assert.equal(initialOnboarding.stages.profile,false);
const staffOnboarding=await call("/api/onboarding","GET",undefined,staffCookie);
assert.equal(staffOnboarding.res.status,403);
const badFirmProfile=await call("/api/onboarding/profile","PUT",{
 name:"Chamber Test Firm",timezone:"Asia/Kolkata",financial_year_start_month:13,
 working_days:[1,2,3,4,5],contact_email:"contact@example.test",grievance_email:"help@example.test"
});
assert.equal(badFirmProfile.res.status,400);
ok(await call("/api/onboarding/profile","PUT",{
 name:"Chamber Test Firm",timezone:"Asia/Kolkata",financial_year_start_month:4,
 working_days:[1,2,3,4,5,6],contact_email:"contact@example.test",grievance_email:"help@example.test",
 privacy_notice_url:"https://example.test/privacy"
}));
const configured=ok(await call("/api/onboarding"));
assert.equal(configured.firm.name,"Chamber Test Firm");
assert.equal(configured.profile.timezone,"Asia/Kolkata");
assert.equal(configured.profile.contact_email,"contact@example.test");
assert.deepEqual(configured.profile.working_days,[1,2,3,4,5,6]);
assert.equal(configured.stages.profile,true);
assert.equal(configured.completed_stages,5);
// Sending remains disabled without firm-owned credentials and a release flag.
const deliveryReadiness=ok(await call("/api/delivery/readiness"));
assert.equal(deliveryReadiness.email,false);
assert.equal(deliveryReadiness.whatsapp,false);
const requestTemplate=ok(await call("/api/messages/templates","POST",{
 name:"Monthly document request",channel:"whatsapp",
 body:"Hello {client}, please supply {missing_list} for {month} by {due}."
}));
const outboundDraft=ok(await call("/api/messages/batches","POST",{
 period:"2026-12",channel:"whatsapp",client_ids:[clientA.id],template_id:requestTemplate.id,confirm_count:1
}));
const noSend=await call("/api/delivery/batches/"+outboundDraft.id+"/queue","POST",{confirm_count:1,confirm_names:"CONFIRM"});
assert.equal(noSend.res.status,503);
const failedWebhook=await call("/api/webhooks/whatsapp","POST",{object:"whatsapp_business_account",entry:[]},"");
assert.equal(failedWebhook.res.status,503);
const submittedTemplate=await call("/api/messages/templates/"+requestTemplate.id+"/provider","PUT",{
 provider_template_id:"monthly_document_request",language_code:"en_US",confirm_approved:true
});
assert.equal(submittedTemplate.res.status,200);
const listedTemplates=ok(await call("/api/messages/templates"));
assert.equal(listedTemplates.templates.find(t=>t.id===requestTemplate.id).provider_template_id,"monthly_document_request");
const denyProviderUpdate=await call("/api/messages/templates/"+requestTemplate.id+"/provider","PUT",{
 provider_template_id:"bad_override",confirm_approved:true
},staffCookie);
assert.equal(denyProviderUpdate.res.status,403);
// Anonymous portal must not reveal another client's checklist without OTP.
const forgedToken="a".repeat(64),forgedAccess="b".repeat(64);
const invalidLinkStart=await call("/api/portal/start","POST",{token:forgedToken},"");
assert.equal(invalidLinkStart.res.status,202);
const checklistWithoutOtp=await call("/api/portal/checklist","POST",{}, "",{
 "X-Portal-Link":forgedToken,"X-Portal-Access":forgedAccess
});
assert.equal(checklistWithoutOtp.res.status,401);
const verifyUnknownOtp=await call("/api/portal/verify","POST",{token:forgedToken,code:"123456"},"");
assert.equal(verifyUnknownOtp.res.status,401);
const portalNotConfigured=await call("/api/portal/links","POST",{
 client_id:clientA.id,period:"2026-12",expires_days:7
});
assert.equal(portalNotConfigured.res.status,503);
const portalStaffDenied=await call("/api/portal/links","POST",{client_id:clientA.id,period:"2026-12"},staffCookie);
assert.equal(portalStaffDenied.res.status,403);
const compliancePack=ok(await call("/api/compliance/starters"));
assert.ok(compliancePack.starters.length>=9);
const unauthorizedStarter=await call("/api/compliance/starters/install","POST",{codes:["gstr3b_monthly"]},staffCookie);
assert.equal(unauthorizedStarter.res.status,403);
const installed=ok(await call("/api/compliance/starters/install","POST",{codes:["gstr3b_monthly"]}));
assert.equal(installed.results.length,1);
assert.equal(installed.results[0].created,true);
const secondInstall=ok(await call("/api/compliance/starters/install","POST",{codes:["gstr3b_monthly"]}));
assert.equal(secondInstall.results[0].created,false);
const starterId=installed.results[0].id;
const cal=ok(await call("/api/compliance/calendar"));
assert.equal(cal.templates.find(t=>t.id===starterId).verified_at,null);
assert.equal(cal.templates.find(t=>t.id===starterId).due_shift,"none");
ok(await call("/api/enrollments","POST",{client_id:clientA.id,template_id:starterId,assignee_id:staff.id}));
const beforeVerification=ok(await call("/api/recurrence","POST",{period:"2026-11"}));
assert.equal(beforeVerification.created,0,"Unverified starter must never automatically schedule compliance work");
const holiday=ok(await call("/api/compliance/holidays","POST",{date:"2026-12-19",name:"Firm planning holiday"}));
assert.ok(holiday.id);
const shifted=ok(await call("/api/compliance/preview","POST",{due_date:"2026-12-20",due_shift:"previous_workday"}));
assert.equal(shifted.adjusted,"2026-12-18");
const withoutSource=await call("/api/compliance/templates/"+starterId,"PUT",{
 due_day:20,due_shift:"previous_workday",ask_by_lead_days:10,source_reference:"",mark_verified:true
});
assert.equal(withoutSource.res.status,400);
ok(await call("/api/compliance/templates/"+starterId,"PUT",{
 due_day:20,due_shift:"previous_workday",ask_by_lead_days:10,
 source_reference:"Official notice checked by principal for the test category",mark_verified:true
}));
const afterVerification=ok(await call("/api/recurrence","POST",{period:"2026-11"}));
assert.equal(afterVerification.created,1);
snap=ok(await call("/api/bootstrap"));
const generatedGst=snap.tasks.find(t=>t.client_id===clientA.id&&t.title==="GSTR-3B monthly"&&t.period==="2026-11");
assert.ok(generatedGst);
assert.equal(generatedGst.due_date,"2026-12-18");
assert.equal(generatedGst.ask_by_date,"2026-12-08");
assert.ok(snap.documents.some(d=>d.task_id===generatedGst.id&&d.name==="ITC reconciliation"));
const holidayRemove=await call("/api/compliance/holidays/"+holiday.id,"DELETE");
assert.equal(holidayRemove.res.status,200);
const health = await fetch(base + "/api/health");
assert.equal(health.status,200);
const page = await fetch(base + "/");
assert.equal(page.status,200);
const html=await page.text();
assert.ok(html.includes('id="root"'), "Vite/React entrypoint should be served");
const match=html.match(/src="(\/assets\/[^"]+\.js)"/);
assert.ok(match, "React production JS bundle must be referenced");
const asset=await fetch(base+match[1]);
assert.equal(asset.status,200);
assert.ok((await asset.text()).includes("react"), "React bundle should load");
const logout = await call("/api/logout","POST",{});
ok(logout);
const unauthorized = await call("/api/bootstrap");
assert.equal(unauthorized.res.status,401);
console.log("Chamber end-to-end smoke test passed: auth, roles, tasks, documents, audit, exports and assets.");
