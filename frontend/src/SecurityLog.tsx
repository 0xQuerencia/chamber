import {useEffect,useState} from "react";
import {AlertTriangle,LockKeyhole,RefreshCw,ShieldCheck} from "lucide-react";
import {getSecurityEvents} from "./api";
import type {SecurityFeed,SecurityEvent} from "./types";
const names:{[key:string]:string}={
 signed_in:"Sign-in",signed_out:"Sign-out",sign_in_failed:"Failed sign-in",
 mfa_verified:"Authenticator verified",mfa_enrolled:"Authenticator enabled",
 accessed_sensitive:"Sensitive data read",viewed_sensitive:"Sensitive data accessed",
 exported:"Data exported",downloaded:"File downloaded",revoked:"Device revoked",
 access_denied:"Access denied",configured:"Integration configured",disconnected:"Integration disconnected"
};
const categories=[["","All security events"],["access_denied","Denied access"],["sign_in_failed","Failed sign-in"],["signed_in","Sign-ins"],
 ["mfa_verified","MFA verification"],["viewed_sensitive","Sensitive data reads"],["exported","Exports"],["revoked","Device revocations"]];
const timestamp=(value:string)=>{
 const date=new Date(value);
 return isNaN(date.getTime())?value:date.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})+" IST";
};
const risk=(event:string)=>event==="access_denied"||event==="sign_in_failed"?"alert":event==="exported"||event==="viewed_sensitive"?"attention":"normal";
export default function SecurityLog({principal,preview}:{principal:boolean;preview:boolean}){
 const [data,setData]=useState<SecurityFeed|null>(null);
 const [event,setEvent]=useState(""),[page,setPage]=useState(0),[tick,setTick]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  if(preview||!principal)return;
  let alive=true;setBusy(true);setError("");
  void getSecurityEvents(page,event).then(res=>{if(alive)setData(res)}).catch(err=>{
    if(alive)setError(err instanceof Error?err.message:String(err));
  }).finally(()=>{if(alive)setBusy(false)});
  return()=>{alive=false};
 },[page,event,tick,preview,principal]);
 if(!principal)return <div role="alert" className="alert">Only a firm principal can inspect security events.</div>;
 return <section className="security-screen">
  <header className="security-heading">
   <div><h1><ShieldCheck size={22}/> Security Audit</h1><p>Account access, exports, denied operations and sensitive client data reads</p></div>
   <button type="button" className="tracker-btn" disabled={busy||preview} onClick={()=>setTick(n=>n+1)}><RefreshCw size={15}/> Refresh</button>
  </header>
  {preview&&<div className="tracker-notice">Sample mode does not provide a security log. Sign in as a principal to view actual events.</div>}
  <div className="security-policy"><LockKeyhole size={17}/><p>Security events are visible only to principals. They do not include passwords, authenticator secrets or session tokens. Changes to the audit history are not available through this interface.</p></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  <div className="security-filters">
   <label>Event type
    <select value={event} disabled={busy||preview} onChange={e=>{setEvent(e.target.value);setPage(0)}}>
     {categories.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select>
   </label>
   <span>{data?.total??0} recorded matching events</span>
  </div>
  <div className="security-table-wrap">
   <table><thead><tr><th>Time (IST)</th><th>Event</th><th>Account</th><th>Target</th><th>Notes</th></tr></thead>
    <tbody>{data?.events.map((e:SecurityEvent)=><tr key={e.id}>
     <td className="security-time">{timestamp(e.at)}</td>
     <td><span className={"security-event "+risk(e.event)}>{risk(e.event)==="alert"&&<AlertTriangle size={12}/>}
      {names[e.event]||e.event.replaceAll("_"," ")}</span></td>
     <td><strong>{e.actor_name||"System"}</strong><small>{e.actor_role||"—"}</small></td>
     <td><strong>{e.entity_type}</strong><small>{e.entity_id}</small></td>
     <td><small>{Object.entries(e.details).map(([k,v])=>k+": "+String(v)).join("; ")||"—"}</small></td>
    </tr>)}
    {!data?.events.length&&!busy&&<tr><td colSpan={5} className="security-empty">No matching security events found.</td></tr>}
    {busy&&<tr><td colSpan={5} className="security-empty">Loading events…</td></tr>}
    </tbody></table>
  </div>
  <footer className="security-footer">
   <span>Read-only audit · Page {page+1}</span><div>
    <button type="button" disabled={busy||page===0||preview} onClick={()=>setPage(p=>p-1)}>Previous</button>
    <button type="button" disabled={busy||preview||!data||((page+1)*data.limit>=data.total)} onClick={()=>setPage(p=>p+1)}>Next</button>
   </div>
  </footer>
 </section>;
}
