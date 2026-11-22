import {useState,type ChangeEvent,type FormEvent} from "react";
import {ArrowLeft,CheckCircle2,FileCheck2,FileUp,LockKeyhole,Mail,RefreshCw,ShieldCheck} from "lucide-react";
import {getPortalChecklist,requestPortalCode,uploadPortalFile,verifyPortalCode} from "./api";
import type {PortalChecklist} from "./types";
const allowed=new Set(["application/pdf","image/jpeg","image/png","text/csv",
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const formatDate=(d:string|null)=>d?new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
export default function ClientPortal({token}:{token:string}){
 const [stage,setStage]=useState<"request"|"verify"|"checklist">("request");
 const [code,setCode]=useState("");
 const [access,setAccess]=useState("");
 const [checklist,setChecklist]=useState<PortalChecklist|null>(null);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [recent,setRecent]=useState<string[]>([]);
 async function action(fn:()=>Promise<void>){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function requestCode(){
  await action(async()=>{
   const result=await requestPortalCode(token);
   setNotice(result.notice);setStage("verify");
  });
 }
 async function verify(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!/^[0-9]{6}$/.test(code))return;
  await action(async()=>{
   const response=await verifyPortalCode(token,code);
   const result=await getPortalChecklist(token,response.access_token);
   setAccess(response.access_token);setChecklist(result);setCode("");setStage("checklist");
   setNotice("Your identity is verified. You may upload the requested documents.");
  });
 }
 async function refresh(){
  if(!access)return;
  await action(async()=>{
   const result=await getPortalChecklist(token,access);
   setChecklist(result);setNotice("Checklist refreshed. Files awaiting scanning may still appear as missing.");
  });
 }
 async function upload(e:ChangeEvent<HTMLInputElement>,itemId:string){
  const file=e.target.files?.[0];if(!file||!access)return;
  e.target.value="";
  if(!allowed.has(file.type)){setError("Choose PDF, JPEG, PNG, CSV or XLSX.");return}
  if(file.size<1||file.size>15*1024*1024){setError("Files must be between 1 byte and 15 MB.");return}
  setUploading(itemId);setError("");setNotice("");
  try{
   const response=await uploadPortalFile(token,access,itemId,file);
   setRecent(old=>[...new Set([...old,itemId])]);
   setNotice(response.message+" The firm will be notified; the document stays pending until it passes security scanning.");
   setChecklist(await getPortalChecklist(token,access));
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setUploading(null)}
 }
 const completed=checklist?.requirements.filter(r=>["received","verified","not_applicable"].includes(r.status)).length||0;
 const count=checklist?.requirements.length||0;
 return <div className="portal-page">
  <div className="portal-top"><span><LockKeyhole size={16}/> Chamber <small>Secure client documents</small></span>
   <span><ShieldCheck size={14}/> Confidential upload portal</span></div>
  <main className="portal-main">
   {stage!=="checklist"?<section className="portal-auth">
    <div className="portal-symbol"><ShieldCheck size={28}/></div>
    <h1>{stage==="request"?"Secure document access":"Verify your email"}</h1>
    <p>{stage==="request"?
     "This private link was issued by your CA firm. To view your checklist, verify ownership of the registered email address.":
     "Enter the six-digit code sent to the email address registered with your CA firm. The code expires after five minutes."}</p>
    {error&&<div className="portal-alert" role="alert">{error}</div>}
    {notice&&<div className="portal-notice" role="status">{notice}</div>}
    {stage==="request"?<button type="button" className="portal-primary" disabled={busy} onClick={()=>void requestCode()}><Mail size={16}/> {busy?"Requesting…":"Send verification code"}</button>:
     <form onSubmit={e=>void verify(e)} className="portal-verification">
      <label htmlFor="portal-otp">Verification code</label>
      <input id="portal-otp" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} type="text" autoComplete="one-time-code"
       inputMode="numeric" maxLength={6} minLength={6} placeholder="000000" required autoFocus/>
      <button className="portal-primary" type="submit" disabled={busy||code.length!==6}><LockKeyhole size={16}/> {busy?"Verifying…":"Verify and open checklist"}</button>
      <button className="portal-text-action" type="button" onClick={()=>{setStage("request");setCode("");setError("")}}><ArrowLeft size={13}/> Request another code</button>
     </form>}
    <p className="portal-footnote">Chamber will never ask for your password, UPI PIN or government portal credentials. If this link is unexpected, contact your CA firm independently.</p>
   </section>:<>
    <header className="portal-heading"><div><small>CLIENT DOCUMENT CHECKLIST</small>
     <h1>{checklist?.client_name}</h1><p>Reporting period: {checklist?.period}</p></div>
     <button type="button" className="portal-refresh" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button>
    </header>
    {error&&<div className="portal-alert" role="alert">{error}</div>}
    {notice&&<div className="portal-notice" role="status">{notice}</div>}
    <section className="portal-progress"><div><strong>{completed} of {count}</strong> checklist items marked complete by the firm</div>
     <div role="progressbar" aria-valuemin={0} aria-valuemax={count||1} aria-valuenow={completed}><span style={{width:count?completed/count*100+"%":"0%"}}/></div></section>
    <section className="portal-list">
     <header><h2>Requested information</h2><p>Upload each item separately. Files are private and scanned before staff can open them.</p></header>
     {checklist?.requirements.map(item=>{
      const done=["received","verified","not_applicable"].includes(item.status),pending=recent.includes(item.id);
      return <article key={item.id} className="portal-item">
       <span className={done?"portal-item-icon complete":"portal-item-icon"}>{done?<CheckCircle2 size={19}/>:<FileCheck2 size={19}/>}</span>
       <div className="portal-item-detail"><h3>{item.name}</h3><p>{done?item.status.replaceAll("_"," ")+(item.received_at?" · Received "+formatDate(item.received_at):""):
          pending?"Upload submitted — security scan pending":"Required · awaiting documents"}</p></div>
       {!done&&<label className="portal-upload"><FileUp size={15}/>
        <span>{uploading===item.id?"Uploading…":"Upload file"}</span>
        <input aria-label={"Upload "+item.name} type="file" disabled={Boolean(uploading)||busy} accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx"
         onChange={e=>void upload(e,item.id)}/>
       </label>}
      </article>})}
     {!count&&<p className="portal-empty">No open checklist items for this period. Contact your CA firm if you expected a request.</p>}
    </section>
    <footer className="portal-footnote">Allowed file types: PDF, JPG, PNG, CSV, XLSX. Maximum 15 MB per file. Uploading is not the same as verification: your firm will review and scan each item. Access expires automatically.</footer>
   </>}
  </main>
 </div>;
}
