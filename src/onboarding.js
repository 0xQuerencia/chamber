// Firm onboarding progress is derived from actual persisted work, never from
// self-reported checkmarks. The principal can revise profile settings any time.
export async function handleOnboarding(request,env,user,deps){
 const {output,fail,clean,audit,iso,bodyJSON,validEmail}=deps;
 if(user.role!=="principal")return fail("Only a principal may configure firm onboarding",403);
 const db=env.DB,path=new URL(request.url).pathname,method=request.method,firm=user.firm_id;

 if(path==="/api/onboarding"&&method==="GET"){
  const [profile,firmRow,staff,clients,templates,requirements,enrollments,tasks,documents,sheets]=await Promise.all([
   db.prepare("SELECT timezone,financial_year_start_month,working_days,contact_email,grievance_email,privacy_notice_url,updated_at FROM firm_profiles WHERE firm_id=?").bind(firm).first(),
   db.prepare("SELECT id,name FROM firms WHERE id=?").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM users WHERE firm_id=? AND active=1").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM clients WHERE firm_id=? AND archived_at IS NULL").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM service_templates WHERE firm_id=? AND active=1").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM requirement_templates WHERE firm_id=? AND required=1").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM service_enrollments WHERE firm_id=? AND active=1").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE firm_id=?").bind(firm).first(),
   db.prepare("SELECT COUNT(*) AS n FROM documents WHERE firm_id=?").bind(firm).first(),
   db.prepare("SELECT enabled FROM sheet_connections WHERE firm_id=?").bind(firm).first()
  ]);
  const counts={users:Number(staff.n),clients:Number(clients.n),templates:Number(templates.n),
   requirements:Number(requirements.n),enrollments:Number(enrollments.n),tasks:Number(tasks.n),documents:Number(documents.n)};
  const stages={
   profile:Boolean(profile?.contact_email&&profile?.grievance_email),
   team:counts.users>=2,
   clients:counts.clients>0,
   services:counts.templates>0&&counts.requirements>0&&counts.enrollments>0,
   first_tasks:counts.tasks>0
  };
  const enabled=Object.values(stages).filter(Boolean).length;
  const userRow=await db.prepare("SELECT mfa_enabled_at FROM users WHERE firm_id=? AND id=?").bind(firm,user.id).first();
  return output({firm:{id:firmRow.id,name:firmRow.name},
   profile:profile?{...profile,working_days:JSON.parse(profile.working_days)}:
    {timezone:"Asia/Kolkata",financial_year_start_month:4,working_days:[1,2,3,4,5,6],contact_email:"",grievance_email:"",privacy_notice_url:"",updated_at:null},
   counts,stages,completed_stages:enabled,total_stages:5,
   integrations:{
    email:{connected:false,description:"Firm-owned Gmail/Microsoft OAuth is not yet configured"},
    whatsapp:{connected:false,description:"Approved WhatsApp Business Cloud API is not yet configured"},
    sheets:{connected:Boolean(sheets?.enabled&&env.GOOGLE_SERVICE_ACCOUNT_JSON)},
    storage:{configured:Boolean(env.FILES)}
   },
   security:{mfa_enabled:Boolean(userRow?.mfa_enabled_at)},
   note:"This wizard never creates fake clients or silently sends messages. Integrations require separate firm authorization."});
 }
 if(path==="/api/onboarding/profile"&&method==="PUT"){
  const data=await bodyJSON(request),name=clean(data.name,120);
  const timezone=clean(data.timezone||"Asia/Kolkata",80),month=Number(data.financial_year_start_month??4);
  const contact=clean(data.contact_email,200).toLowerCase();
  const grievance=clean(data.grievance_email,200).toLowerCase();
  const privacy=clean(data.privacy_notice_url,400);
  const days=data.working_days;
  if(!name||!Number.isInteger(month)||month<1||month>12||
   !Array.isArray(days)||days.length<1||days.length>7||
   days.some(x=>!Number.isInteger(x)||x<0||x>6)||new Set(days).size!==days.length||
   !validEmail(contact)||!validEmail(grievance)||(privacy&&!/^https:\/\//i.test(privacy)))
   return fail("Provide a firm name, valid emails, working days and HTTPS privacy notice URL");
  try{new Intl.DateTimeFormat("en-IN",{timeZone:timezone})}
  catch{return fail("Use a valid IANA time zone such as Asia/Kolkata")}
  const sorted=[...days].sort(),at=iso();
  await db.batch([
   db.prepare("UPDATE firms SET name=? WHERE id=?").bind(name,firm),
   db.prepare("INSERT INTO firm_profiles(firm_id,timezone,financial_year_start_month,working_days,contact_email,grievance_email,privacy_notice_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(firm_id) DO UPDATE SET timezone=excluded.timezone,financial_year_start_month=excluded.financial_year_start_month,working_days=excluded.working_days,contact_email=excluded.contact_email,grievance_email=excluded.grievance_email,privacy_notice_url=excluded.privacy_notice_url,updated_at=excluded.updated_at")
    .bind(firm,timezone,month,JSON.stringify(sorted),contact,grievance,privacy||null,at,at),
   await audit(db,user,"updated","firm_profile",firm,{timezone,financial_year_start_month:month,working_days:sorted})
  ]);
  return output({ok:true});
 }
 return fail("Not found",404);
}
