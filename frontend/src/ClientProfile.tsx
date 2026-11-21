import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowUpRight, CheckCircle2, Plus, X } from "lucide-react";
import { addClientContact, addClientGstin, archiveClient, getClientProfile, updateClient } from "./api";
import PortalLinks from "./PortalLinks";
import type { Client, ClientProfileData, Workspace } from "./types";

type Tab="overview"|"services"|"data"|"tasks"|"documents"|"messages"|"activity";
const tabs:Tab[]=["overview","services","data","tasks","documents","messages","activity"];
const label=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
const field=(title:string,name:string,defaultValue?:string|null,type="text")=><label className="client-field"><span>{title}</span><input name={name} defaultValue={defaultValue??""} type={type}/></label>;

export default function ClientProfile({client,workspace,privileged,preview,onRefresh,onClose,onTracker}:{
 client:Client;workspace:Workspace;privileged:boolean;preview:boolean;onRefresh:()=>Promise<void>;onClose:()=>void;onTracker:()=>void
}){
 const [profile,setProfile]=useState<ClientProfileData|null>(null);
 const [tab,setTab]=useState<Tab>("overview");
 const [form,setForm]=useState<"none"|"edit"|"contact"|"gstin">("none");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let open=true;
  if(preview){
   setProfile({client,contacts:[],gstins:[]});
   return;
  }
  setProfile(null);
  void getClientProfile(client.id).then(p=>{if(open)setProfile(p)}).catch(e=>{if(open)setError(String(e))});
  return()=>{open=false};
 },[client.id,preview,revision,client]);
 const tasks=useMemo(()=>workspace.tasks.filter(t=>t.client_id===client.id),[client.id,workspace.tasks]);
 const docs=useMemo(()=>workspace.documents.filter(d=>d.client_id===client.id),[client.id,workspace.documents]);
 const enrolments=workspace.enrollments.filter(e=>e.client_id===client.id&&e.active);
 const data=profile?.client??client;
 const formDisabled=!privileged||preview||busy;
 async function transact(action:()=>Promise<unknown>,text:string){
  setBusy(true);setError("");setMessage("");
  try{
   await action();setMessage(text);setForm("none");setRevision(i=>i+1);await onRefresh();return true;
  }catch(e){setError(e instanceof Error?e.message:String(e));return false}finally{setBusy(false)}
 }
 function fields(e:FormEvent<HTMLFormElement>){return Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>}
 async function saveEdit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const values=fields(e);
  await transact(()=>updateClient(client.id,values),"Client updated.");
 }
 async function saveContact(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const values=fields(e);
  await transact(()=>addClientContact(client.id,{
   ...values,whatsapp_opt_in:Boolean(new FormData(e.currentTarget).get("whatsapp_opt_in"))
  }),"Contact added.");
 }
 async function saveGstin(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const values=fields(e);
  await transact(()=>addClientGstin(client.id,values.gstin),"GST registration added.");
 }
 async function doArchive(){
  if(!privileged||preview||!window.confirm("Archive this client? Open tasks must be completed first."))return;
  if(await transact(()=>archiveClient(client.id),"Client archived."))onClose();
 }
 return <aside className="detail-card client-profile" aria-label={"Client profile: "+client.name}>
  <div className="detail-head"><div><p className="hint">CLIENT MASTER</p><h2>{data.name}</h2><p className="muted small">{data.code??"No client code"} · {data.category}</p></div>
   <button type="button" className="close-button" onClick={onClose} aria-label="Close client profile"><X size={18}/></button></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="client-notice" role="status">{message}</div>}
  <nav className="client-tabs" aria-label="Client profile sections">{tabs.map(t=><button key={t} type="button" className={t===tab?"active":""}
   aria-current={t===tab?"page":undefined} onClick={()=>{setTab(t);setForm("none")}}>{label(t)}</button>)}</nav>
  {!profile?<p className="muted small">Loading client details…</p>:<>
  {tab==="overview"&&<>
   <div className="detail-kv client-overview">
    <div><label>Client code</label><span>{data.code??"—"}</span></div>
    <div><label>Group</label><span>{data.client_group??"—"}</span></div>
    <div><label>Email</label><span>{data.email??"—"}</span></div>
    <div><label>Phone</label><span>{data.phone??"—"}</span></div>
    {privileged&&<><div><label>PAN</label><span>{data.pan?"••••"+data.pan.slice(-4):"—"}</span></div><div><label>Primary GSTIN</label><span>{data.gstin?"••••"+data.gstin.slice(-4):"—"}</span></div></>}
    <div><label>Created</label><span>{date(data.created_at)}</span></div>
   </div>
   {privileged&&<div className="client-actions">
    <button type="button" onClick={()=>setForm(form==="edit"?"none":"edit")} disabled={formDisabled}>Edit client</button>
    <button type="button" onClick={()=>void doArchive()} disabled={formDisabled}><Archive size={13}/> Archive</button>
   </div>}
   {form==="edit"&&<form key={client.id+"-"+revision} onSubmit={e=>void saveEdit(e)} className="client-form">
    {field("Client code","code",data.code)}
    {field("Name","name",data.name)}
    {field("Category","category",data.category)}
    {field("Group","client_group",data.client_group)}
    {field("Email","email",data.email,"email")}
    {field("Phone","phone",data.phone)}
    {field("PAN","pan",data.pan)}
    {field("Primary GSTIN","gstin",data.gstin)}
    {field("Notes","notes",data.notes)}
    <button className="tracker-btn primary" disabled={busy} type="submit">Save changes</button>
   </form>}
   <section className="client-subsection">
    <div className="client-subheading"><h3>Contacts</h3>{privileged&&<button disabled={formDisabled} onClick={()=>setForm(form==="contact"?"none":"contact")}><Plus size={14}/> Add</button>}</div>
    {profile.contacts.length===0?<p className="muted small">No contacts recorded.</p>:profile.contacts.map(c=><div className="client-contact" key={c.id}>
     <strong>{c.name}</strong><span>{c.title??c.preferred_channel}</span>
     <p>{c.email??"No email"} · {c.phone??"No phone"}</p>
     {privileged&&<small>{c.whatsapp_opt_in_at?"WhatsApp opt-in: "+date(c.whatsapp_opt_in_at):"No WhatsApp opt-in recorded"}</small>}
    </div>)}
    {form==="contact"&&<form className="client-form" onSubmit={e=>void saveContact(e)}>
     {field("Contact name","name")}{field("Role / title","title")}{field("Work email","email",undefined,"email")}{field("Phone","phone")}
     <label className="client-field"><span>Preferred channel</span><select name="preferred_channel"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option></select></label>
     <label className="client-check"><input name="whatsapp_opt_in" type="checkbox"/> Client expressly opted in to WhatsApp communications</label>
     {field("Opt-in evidence / source","whatsapp_opt_in_source")}
     <button className="tracker-btn primary" type="submit" disabled={busy}>Save contact</button>
    </form>}
   </section>
   {privileged&&<section className="client-subsection">
    <div className="client-subheading"><h3>GST registrations</h3><button disabled={formDisabled} onClick={()=>setForm(form==="gstin"?"none":"gstin")}><Plus size={14}/> Add</button></div>
    {profile.gstins.length===0?<p className="muted small">No additional GST registrations recorded.</p>:profile.gstins.map(g=><div className="client-contact" key={g.id}><strong>{g.gstin}</strong><span>State {g.state_code}</span></div>)}
    {form==="gstin"&&<form className="client-form" onSubmit={e=>void saveGstin(e)}>{field("GSTIN (15 characters)","gstin")}
     <button type="submit" className="tracker-btn primary" disabled={busy}>Add GSTIN</button></form>}
   </section>}
  </>}
  {tab==="services"&&<section className="client-subsection"><h3>Enrolled services</h3>
   {enrolments.length===0?<p className="muted small">No recurring services enrolled. Use Compliance to enroll.</p>:
    enrolments.map(en=>{const t=workspace.templates.find(t=>t.id===en.template_id);return <div className="client-contact" key={en.id}>
     <strong>{t?.name??"Service"}</strong><span>{t?.frequency??""} · {t?.service??""}</span></div>})}
  </section>}
  {tab==="data"&&<section className="client-subsection"><div className="client-subheading"><h3>Missing data</h3><button onClick={onTracker}>Open tracker <ArrowUpRight size={13}/></button></div>
   {docs.filter(d=>["missing","requested","rejected"].includes(d.status)).length===0?<p className="muted small">No outstanding requirements in the loaded work records.</p>:
    docs.filter(d=>["missing","requested","rejected"].includes(d.status)).map(d=><div key={d.id} className="client-contact"><strong>{d.name}</strong><span>{d.status}</span></div>)}
  </section>}
  {tab==="tasks"&&<section className="client-subsection"><h3>Assignments</h3>
   {tasks.length===0?<p className="muted small">No assignments.</p>:tasks.map(t=><div key={t.id} className="client-contact"><strong>{t.title}</strong><span>{t.status.replaceAll("_"," ")} · {t.period??"No period"}</span><p>Due: {date(t.due_date)}</p></div>)}
  </section>}
  {tab==="documents"&&<section className="client-subsection"><h3>Document requirements</h3>
   {docs.length===0?<p className="muted small">No document requirements.</p>:docs.map(d=><div key={d.id} className="client-contact"><strong>{d.name}</strong><span>{d.status.replaceAll("_"," ")}</span><p>Requested {date(d.requested_at)}</p></div>)}
   {privileged&&<PortalLinks clientId={client.id} preview={preview}/>}
  </section>}
  {tab==="messages"&&<section className="client-subsection"><h3>Client messages</h3><p className="muted small">No delivery integration is configured. Drafts are not recorded as sent messages.</p></section>}
  {tab==="activity"&&<section className="client-subsection"><h3>Recent activity</h3>
   {workspace.activity.filter(e=>e.entity_id===client.id||tasks.some(t=>t.id===e.entity_id)||docs.some(d=>d.id===e.entity_id)).length===0?<p className="muted small">No visible history yet.</p>:
    workspace.activity.filter(e=>e.entity_id===client.id||tasks.some(t=>t.id===e.entity_id)||docs.some(d=>d.id===e.entity_id)).map(e=><div key={e.id} className="client-contact"><CheckCircle2 size={12}/><strong>{e.event} {e.entity_type}</strong><p>{date(e.at)}</p></div>)}
  </section>}
  </>}
 </aside>;
}
