import {STARTER_SERVICES,normalizeWorkdays,dueShift} from "./compliance-domain.js";
import {validCalendarDate} from "./domain.js";

const isPrincipal=user=>user.role==="principal";
const validCode=/^[a-z0-9_]{2,50}$/;
export async function handleCompliance(request,env,user,deps){
 const {output,fail,clean,bodyJSON,audit,id,iso}=deps;
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method,firm=user.firm_id;
 if(path==="/api/compliance/starters"&&method==="GET"){
  const installed=(await db.prepare("SELECT starter_code FROM service_templates WHERE firm_id=? AND starter_code IS NOT NULL")
   .bind(firm).all()).results.map(x=>x.starter_code);
  return output({starters:STARTER_SERVICES.map(x=>({...x,installed:installed.includes(x.code)})),
   notice:"Starter due days are editable planning suggestions, NOT official statutory deadlines."});
 }
 if(path==="/api/compliance/starters/install"&&method==="POST"){
  if(!isPrincipal(user))return fail("Principal permission required",403);
  const data=await bodyJSON(request),codes=data.codes;
  if(!Array.isArray(codes)||!codes.length||codes.length>STARTER_SERVICES.length||
    codes.some(x=>typeof x!=="string"||!validCode.test(x))||new Set(codes).size!==codes.length)
   return fail("Choose 1–9 unique starter services");
  const requested=codes.map(code=>STARTER_SERVICES.find(x=>x.code===code));
  if(requested.some(x=>!x))return fail("Unknown starter service");
  const at=iso(),result=[];
  for(const s of requested){
   const exists=await db.prepare("SELECT id FROM service_templates WHERE firm_id=? AND starter_code=?").bind(firm,s.code).first();
   if(exists){result.push({code:s.code,id:exists.id,created:false});continue}
   const tid=id();
   try{
    await db.batch([
     db.prepare("INSERT INTO service_templates(id,firm_id,name,service,frequency,due_day,ask_by_lead_days,active,created_at,starter_code,source_reference) VALUES(?,?,?,?,?,?,?,1,?,?,?)")
      .bind(tid,firm,s.name,s.service,s.frequency,s.day,s.lead,at,s.code,
       "Unverified starter planning date — principal must verify and record an official source"),
     ...s.requirements.map((name,i)=>db.prepare("INSERT INTO requirement_templates(id,firm_id,template_id,name,required,sort_order,created_at) VALUES(?,?,?,?,1,?,?)")
      .bind(id(),firm,tid,name,i+1,at)),
     await audit(db,user,"installed","compliance_starter",tid,{code:s.code,verified:false})
    ]);
    result.push({code:s.code,id:tid,created:true});
   }catch(e){
    if(!/UNIQUE|constraint failed/.test(String(e)))throw e;
    const existing=await db.prepare("SELECT id FROM service_templates WHERE firm_id=? AND starter_code=?").bind(firm,s.code).first();
    if(!existing)throw e;
    result.push({code:s.code,id:existing.id,created:false});
   }
  }
  return output({results:result,notice:"Set and verify the source-backed due rules before operational use."});
 }
 if(path==="/api/compliance/calendar"&&method==="GET"){
  const [profile,holidays,templates]=await Promise.all([
   db.prepare("SELECT working_days,timezone FROM firm_profiles WHERE firm_id=?").bind(firm).first(),
   db.prepare("SELECT id,date,name FROM compliance_holidays WHERE firm_id=? ORDER BY date").bind(firm).all(),
   db.prepare("SELECT id,name,service,frequency,due_day,due_shift,ask_by_lead_days,source_reference,verified_at,starter_code FROM service_templates WHERE firm_id=? AND active=1 ORDER BY name").bind(firm).all()
  ]);
  return output({working_days:profile?JSON.parse(profile.working_days):[1,2,3,4,5,6],
   timezone:profile?.timezone||"Asia/Kolkata",holidays:holidays.results,templates:templates.results});
 }
 if(path==="/api/compliance/holidays"&&method==="POST"){
  if(!isPrincipal(user))return fail("Principal permission required",403);
  const data=await bodyJSON(request),date=clean(data.date,10),name=clean(data.name,100);
  if(!validCalendarDate(date)||!name)return fail("Valid holiday date and description required");
  const hid=id();
  try{
   await db.batch([
    db.prepare("INSERT INTO compliance_holidays(id,firm_id,date,name,created_by,created_at) VALUES(?,?,?,?,?,?)")
     .bind(hid,firm,date,name,user.id,iso()),
    await audit(db,user,"created","compliance_holiday",hid,{date,name})
   ]);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("Holiday already recorded",409);throw e}
  return output({id:hid},201);
 }
 const holiday=path.match(/^\/api\/compliance\/holidays\/([a-f0-9-]+)$/);
 if(holiday&&method==="DELETE"){
  if(!isPrincipal(user))return fail("Principal permission required",403);
  const row=await db.prepare("SELECT id,date FROM compliance_holidays WHERE firm_id=? AND id=?").bind(firm,holiday[1]).first();
  if(!row)return fail("Holiday not found",404);
  await db.batch([
   db.prepare("DELETE FROM compliance_holidays WHERE firm_id=? AND id=?").bind(firm,row.id),
   await audit(db,user,"deleted","compliance_holiday",row.id,{date:row.date})
  ]);
  return output({ok:true});
 }
 const template=path.match(/^\/api\/compliance\/templates\/([a-f0-9-]+)$/);
 if(template&&method==="PUT"){
  if(!isPrincipal(user))return fail("Principal permission required",403);
  const data=await bodyJSON(request),day=Number(data.due_day),shift=clean(data.due_shift,30);
  const lead=Number(data.ask_by_lead_days),reference=clean(data.source_reference,300);
  if(!Number.isInteger(day)||day<1||day>28||!["none","previous_workday","next_workday"].includes(shift)||
   !Number.isInteger(lead)||lead<0||lead>90)return fail("Invalid planning due rule");
  const existing=await db.prepare("SELECT id,verified_at FROM service_templates WHERE firm_id=? AND id=? AND active=1").bind(firm,template[1]).first();
  if(!existing)return fail("Template not found",404);
  const verify=data.mark_verified===true;
  if(verify&&reference.length<12)return fail("Record the official notice or statutory source when verifying a date rule");
  const at=iso();
  // Existing generated tasks retain their dates: changes require an explicit, auditable override.
  await db.batch([
   db.prepare("UPDATE service_templates SET due_day=?,due_shift=?,ask_by_lead_days=?,source_reference=?,verified_at=?,verified_by=? WHERE id=? AND firm_id=?")
    .bind(day,shift,lead,reference||null,verify?at:null,verify?user.id:null,existing.id,firm),
   await audit(db,user,"updated","compliance_rule",existing.id,{due_day:day,due_shift:shift,ask_by_lead_days:lead,source_reference:reference,verified:verify})
  ]);
  return output({ok:true,existing_tasks_unchanged:true,
   note:"Future periods use the updated rule. Use a sourced due-date override for previously generated tasks."});
 }
 if(path==="/api/compliance/preview"&&method==="POST"){
  if(user.role!=="principal"&&user.role!=="manager")return fail("Insufficient permission",403);
  const data=await bodyJSON(request),date=clean(data.due_date,10),shift=clean(data.due_shift,30);
  if(!validCalendarDate(date)||!["none","previous_workday","next_workday"].includes(shift))return fail("Choose valid planning date and shift");
  const [profile,daysOff]=await Promise.all([
   db.prepare("SELECT working_days FROM firm_profiles WHERE firm_id=?").bind(firm).first(),
   db.prepare("SELECT date FROM compliance_holidays WHERE firm_id=? AND date>=? AND date<=?").bind(firm,
    new Date(Date.parse(date+"T00:00:00Z")-90*86400000).toISOString().slice(0,10),
    new Date(Date.parse(date+"T00:00:00Z")+90*86400000).toISOString().slice(0,10)).all()
  ]);
  const working=normalizeWorkdays(profile?JSON.parse(profile.working_days):[1,2,3,4,5,6]);
  return output({original:date,adjusted:dueShift(date,shift,working,daysOff.results.map(x=>x.date)),shift,
   warning:"Planning rule only. Verify official due date before marking compliance complete."});
 }
 return fail("Not found",404);
}
