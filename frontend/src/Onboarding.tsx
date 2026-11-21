import {useCallback,useEffect,useState,type FormEvent} from "react";
import {Building2,CalendarDays,CheckCircle2,Circle,FolderOpen,Mail,MessageCircle,RefreshCw,ShieldCheck,Users} from "lucide-react";
import {createRecord,generatePeriod,getOnboarding,saveFirmProfile} from "./api";
import type {FirmProfile,OnboardingStatus,View,Workspace} from "./types";

type Step="profile"|"team"|"clients"|"services"|"first_tasks";
const steps:{id:Step;name:string;description:string;icon:typeof Building2}[]=[
 {id:"profile",name:"Firm profile",description:"Financial year, working days and contact details",icon:Building2},
 {id:"team",name:"Team & roles",description:"Give every employee their own account",icon:Users},
 {id:"clients",name:"Client database",description:"Import or create your first clients",icon:FolderOpen},
 {id:"services",name:"Service templates",description:"Enrol clients and define requirements",icon:CalendarDays},
 {id:"first_tasks",name:"Generate first work",description:"Create assignments and confirm the initial tracker",icon:CheckCircle2}
];
const dateMonth=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
const defaultProfile:FirmProfile={timezone:"Asia/Kolkata",financial_year_start_month:4,
 working_days:[1,2,3,4,5,6],contact_email:"",grievance_email:"",privacy_notice_url:"",updated_at:null};
const weekdays=[["1","Mon"],["2","Tue"],["3","Wed"],["4","Thu"],["5","Fri"],["6","Sat"],["0","Sun"]];
function Input({name,label,type="text",required=false,defaultValue}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string}){
 return <label className="onboarding-input">{label}<input name={name} type={type} required={required} defaultValue={defaultValue??""}/></label>;
}
export default function Onboarding({workspace,preview,onNavigate,onRefresh}:{
 workspace:Workspace;preview:boolean;onNavigate:(v:View)=>void;onRefresh:()=>Promise<void>
}){
 const principal=workspace.user.role==="principal";
 const [status,setStatus]=useState<OnboardingStatus|null>(null);
 const [step,setStep]=useState<Step>("profile");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [revision,setRevision]=useState(0);
 const [name,setName]=useState(workspace.firm.name);
 const [profile,setProfile]=useState<FirmProfile>(defaultProfile);
 const [period,setPeriod]=useState(dateMonth);
 const [selectedTemplate,setSelectedTemplate]=useState("");
 const [selectedClient,setSelectedClient]=useState("");
 const load=useCallback(async()=>{const result=await getOnboarding();setStatus(result);setName(result.firm.name);setProfile(result.profile)},[]);
 useEffect(()=>{
  if(preview||!principal)return;
  let open=true;
  void getOnboarding().then(res=>{if(open){setStatus(res);setName(res.firm.name);setProfile(res.profile)}})
   .catch(e=>{if(open)setError(String(e))});
  return()=>{open=false};
 },[revision,preview,principal]);

 async function act(fn:()=>Promise<unknown>,message:string){
  if(busy||preview||!principal)return;
  setBusy(true);setError("");setNotice("");
  try{await fn();await onRefresh();await load();setNotice(message);setRevision(n=>n+1)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function profileSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  await act(()=>saveFirmProfile(name,profile),"Firm profile saved. Progress verified from the database.");
 }
 async function teamSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
  await act(()=>createRecord("staff",v),"Member created. They can sign in with their own credentials.");
 }
 async function templateSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
  await act(()=>createRecord("templates",v),"Recurring service template created.");
 }
 async function requirementSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
  await act(()=>createRecord("requirements",{...v,template_id:selectedTemplate}),"Checklist requirement saved.");
 }
 async function enrollSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
  await act(()=>createRecord("enrollments",{...v,client_id:selectedClient}),"Client enrolled in recurring service.");
 }
 if(!principal)return <div className="alert" role="alert">Only a principal can configure a firm.</div>;
 const progress=status?Math.round(status.completed_stages/status.total_stages*100):0;
 return <section className="onboarding">
  <header className="onboarding-heading"><div><h1>Set up your CA firm</h1>
   <p>A practical, step-by-step checklist linked to real Chamber records.</p></div>
   <button className="tracker-btn" type="button" disabled={busy||preview} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/> Recheck progress</button>
  </header>
  {preview&&<div className="tracker-notice">Read-only preview. Sign in as a principal to configure your firm's information.</div>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {notice&&<div className="tracker-notice" role="status">{notice}</div>}
  <div className="onboarding-progress">
   <div><strong>{status?.completed_stages??0} of {status?.total_stages??5} complete</strong>
    <span>{progress}% of core setup requirements fulfilled</span></div>
   <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:progress+"%"}}/></div>
  </div>
  <div className="onboarding-layout">
   <aside className="onboarding-step-list" aria-label="Firm setup stages">
    {steps.map((s,i)=><button key={s.id} type="button" onClick={()=>setStep(s.id)} className={step===s.id?"current":""} aria-current={step===s.id?"step":undefined}>
     <span className="onboarding-step-status">{status?.stages[s.id]?<CheckCircle2 size={19}/>:<Circle size={19}/>}</span>
     <span><strong>{i+1}. {s.name}</strong><small>{s.description}</small></span>
    </button>)}
   </aside>
   <div className="onboarding-content">
    {step==="profile"&&<section>
     <h2>Firm profile</h2><p className="onboarding-hint">The information here establishes your default working calendar and firm contact details.</p>
     <form onSubmit={e=>void profileSubmit(e)} className="onboarding-fields">
      <label className="onboarding-input">Firm name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></label>
      <label className="onboarding-input">Time zone<input value={profile.timezone} onChange={e=>setProfile(p=>({...p,timezone:e.target.value}))} required/></label>
      <label className="onboarding-input">Financial year starts in
       <select value={profile.financial_year_start_month} onChange={e=>setProfile(p=>({...p,financial_year_start_month:Number(e.target.value)}))}>
        {Array.from({length:12},(_,i)=><option key={i} value={i+1}>{new Date(Date.UTC(2026,i,1)).toLocaleString("en-IN",{month:"long",timeZone:"UTC"})}</option>)}
       </select></label>
      <label className="onboarding-input">Firm contact email<input type="email" value={profile.contact_email} onChange={e=>setProfile(p=>({...p,contact_email:e.target.value}))} required/></label>
      <label className="onboarding-input">Grievance contact email<input type="email" value={profile.grievance_email} onChange={e=>setProfile(p=>({...p,grievance_email:e.target.value}))} required/></label>
      <label className="onboarding-input">Published privacy notice (HTTPS, optional)<input type="url" value={profile.privacy_notice_url||""} onChange={e=>setProfile(p=>({...p,privacy_notice_url:e.target.value}))} placeholder="https://example.in/privacy"/></label>
      <fieldset className="onboarding-working-days"><legend>Working days</legend>
       {weekdays.map(([id,day])=><label key={id}><input type="checkbox" checked={profile.working_days.includes(Number(id))}
        onChange={e=>setProfile(p=>({...p,working_days:e.target.checked?[...p.working_days,Number(id)]:p.working_days.filter(n=>n!==Number(id))}))}/>{day}</label>)}
      </fieldset>
      <button className="tracker-btn primary" type="submit" disabled={busy||preview}>Save firm profile</button>
     </form>
    </section>}
    {step==="team"&&<section>
     <h2>Team and roles</h2><p className="onboarding-hint">Every article and staff member needs a separate named account. Principals and managers must set up authenticator verification.</p>
     <p className="onboarding-count"><Users size={17}/> {status?.counts.users??workspace.staff.length} active users</p>
     <form className="onboarding-fields" onSubmit={e=>void teamSubmit(e)} key={"team"+revision}>
      <Input name="name" label="Member's name" required/><Input name="email" label="Work email" type="email" required/>
      <Input name="password" label="Initial password (12+ characters)" type="password" required/>
      <label className="onboarding-input">Role<select name="role"><option value="staff">Article / staff</option><option value="manager">Manager</option></select></label>
      <label className="onboarding-input">Reporting manager (optional)<select name="manager_id"><option value="">No reporting manager</option>
       {workspace.staff.filter(s=>s.role==="principal"||s.role==="manager").map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>
      <button className="tracker-btn primary" type="submit" disabled={busy||preview}>Add team member</button>
     </form>
    </section>}
    {step==="clients"&&<section>
     <h2>Bring in your client list</h2>
     <p className="onboarding-hint">You can import hundreds of client records with column mapping, a dry-run and error reporting. Do not upload actual client data to the sample preview.</p>
     <p className="onboarding-count"><FolderOpen size={17}/> {status?.counts.clients??workspace.clients.length} active clients</p>
     <div className="onboarding-actions">
      <button className="tracker-btn primary" disabled={preview} onClick={()=>onNavigate("import")}>Open CSV/XLSX import</button>
      <button className="tracker-btn" disabled={preview} onClick={()=>onNavigate("clients")}>Open Client Master</button>
     </div>
     <p className="onboarding-hint">After importing or adding records, return here to see the actual client count.</p>
    </section>}
    {step==="services"&&<section>
     <h2>Choose services and checklists</h2>
     <p className="onboarding-hint">Set your firm's internal deadlines, ask-by lead days, the required information, and which clients use the service. These are planning dates, not verified statutory deadlines.</p>
     <div className="onboarding-counts"><span>{status?.counts.templates??0} service templates</span><span>{status?.counts.requirements??0} required items</span><span>{status?.counts.enrollments??0} active enrolments</span></div>
     <div className="onboarding-form-grid">
      <form key={"template"+revision} onSubmit={e=>void templateSubmit(e)} className="onboarding-fields">
       <h3>1. Service template</h3>
       <Input name="name" label="Template name" required/>
       <Input name="service" label="Service (GST, TDS, Audit…)" required/>
       <label className="onboarding-input">Frequency<select name="frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
       <label className="onboarding-input">Planning due day<input type="number" name="due_day" min="1" max="28" defaultValue="15" required/></label>
       <label className="onboarding-input">Ask-by lead days<input type="number" name="ask_by_lead_days" min="0" max="90" defaultValue="10" required/></label>
       <button className="tracker-btn" disabled={preview||busy} type="submit">Save template</button>
      </form>
      <form key={"requirement"+revision} onSubmit={e=>void requirementSubmit(e)} className="onboarding-fields">
       <h3>2. Required documents</h3>
       <label className="onboarding-input">Template<select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)} required>
        <option value="">Choose a template</option>{workspace.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
       </select></label>
       <Input name="name" label="Required document" required/>
       <label className="onboarding-input">Sort order<input type="number" name="sort_order" min="0" defaultValue="0"/></label>
       <button className="tracker-btn" disabled={preview||busy||!selectedTemplate} type="submit">Add requirement</button>
      </form>
      <form key={"enroll"+revision} onSubmit={e=>void enrollSubmit(e)} className="onboarding-fields">
       <h3>3. Enrol your client</h3>
       <label className="onboarding-input">Client<select value={selectedClient} onChange={e=>setSelectedClient(e.target.value)} required>
        <option value="">Choose a client</option>{workspace.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select></label>
       <label className="onboarding-input">Template<select name="template_id" required>
        <option value="">Choose a template</option>{workspace.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
       </select></label>
       <label className="onboarding-input">Default assignee<select name="assignee_id">
        <option value="">Unassigned</option>{workspace.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
       </select></label>
       <button className="tracker-btn" disabled={preview||busy||!selectedClient} type="submit">Enrol client</button>
      </form>
     </div>
    </section>}
    {step==="first_tasks"&&<section>
     <h2>Generate your first work period</h2>
     <p className="onboarding-hint">Generate actual assignments from enrolled services. Repeated generation is duplicate-safe, and required documents appear in the monthly tracker.</p>
     <p className="onboarding-count"><CalendarDays size={17}/> {status?.counts.tasks??0} assignments · {status?.counts.documents??0} document requirements</p>
     <div className="onboarding-generate">
      <label className="onboarding-input">Generate for<input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label>
      <button className="tracker-btn primary" disabled={busy||preview||(status?.counts.enrollments??0)===0}
       onClick={()=>void act(async()=>{
        const result=await generatePeriod(period);
        setNotice(result.created+" new assignments; "+result.already+" already existed.");
       },"Period generation completed. Check the tracker and work board.")}>Generate assignments</button>
     </div>
     <div className="onboarding-actions">
      <button className="tracker-btn" onClick={()=>onNavigate("tracker")}>Open Data Tracker</button>
      <button className="tracker-btn" onClick={()=>onNavigate("board")}>Open Work Board</button>
     </div>
    </section>}
    <section className="onboarding-integrations">
     <h3><ShieldCheck size={16}/> Integrations and security</h3>
     <div><Mail size={15}/><span>Firm email</span><strong>{status?.integrations.email.connected?"Connected":"Not configured"}</strong></div>
     <div><MessageCircle size={15}/><span>WhatsApp Business</span><strong>{status?.integrations.whatsapp.connected?"Connected":"Not configured"}</strong></div>
     <div><CheckCircle2 size={15}/><span>Google Sheets mirror</span><strong>{status?.integrations.sheets.connected?"Connected":"Optional · unconnected"}</strong></div>
     <div><ShieldCheck size={15}/><span>Principal's TOTP</span><strong>{status?.security.mfa_enabled?"Enabled":"Required"}</strong></div>
     <p>Email and WhatsApp delivery cannot be enabled here until the firm's approved provider is configured. Chamber does not claim messages have been sent without delivery integration.</p>
     <button className="tracker-btn" type="button" onClick={()=>onNavigate("settings")}>Open Settings & Integrations</button>
    </section>
   </div>
  </div>
 </section>;
}
