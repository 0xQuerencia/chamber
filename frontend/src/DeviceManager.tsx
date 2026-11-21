import { useEffect, useState } from "react";
import { Laptop, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { getDevices, revokeDevice } from "./api";
import type { DeviceList, NamedDevice } from "./types";
const when=(value:string)=>new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"});
export default function DeviceManager({role,preview}:{role:string;preview:boolean}){
 const [devices,setDevices]=useState<DeviceList|null>(null);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;if(preview)return;
  setLoading(true);
  void getDevices().then(r=>{if(active)setDevices(r)}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[preview,version]);
 async function revoke(item:NamedDevice){
  if(!window.confirm("Revoke "+item.label+"? Existing sessions from this device will be signed out."))return;
  setBusy(item.id);setError("");setNotice("");
  try{
   await revokeDevice(item.id);
   if(item.id===devices?.current_device_id){window.location.replace("/");return}
   setNotice("Device access revoked.");setVersion(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(null)}
 }
 return <section className="devices-panel">
  <header><div><h2><ShieldCheck size={17}/> Named devices and sessions</h2><p>Each sign-in registers a named browser session. Revoked devices immediately lose access to the firm.</p></div>
   <button onClick={()=>setVersion(v=>v+1)} type="button" disabled={loading||preview} aria-label="Refresh devices"><RefreshCw size={15}/></button>
  </header>
  <div className="devices-policy"><ShieldAlert size={15}/> Idle sessions expire after 30 minutes; all sessions have a seven-day maximum lifetime. Only the principal can view everyone's devices.</div>
  {error&&<div className="alert" role="alert">{error}</div>}
  {notice&&<p className="devices-notice" role="status">{notice}</p>}
  {loading&&<p className="devices-muted">Loading registered devices…</p>}
  {preview&&<p className="devices-muted">Device management is unavailable in sample mode.</p>}
  {!preview&&devices&&<>
   <p className="devices-muted">{role==="principal"?"Firm devices":"Your devices"} · {devices.devices.filter(d=>!d.revoked_at).length} active sessions</p>
   <div className="devices-table-scroll"><table className="devices-table"><thead><tr><th>Device</th><th>Team member</th><th>Last seen (IST)</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>{devices.devices.map(d=><tr key={d.id}>
     <td><span className="devices-name"><Laptop size={15}/><strong>{d.label}</strong>{d.id===devices.current_device_id&&<small>This session</small>}</span>
      <span className="devices-agent">{d.user_agent}</span></td>
     <td>{d.user_name}</td><td>{when(d.last_seen_at)}</td>
     <td>{d.revoked_at?<span className="devices-revoked"><XCircle size={13}/> Revoked</span>:<span className="devices-active"><ShieldCheck size={13}/> Active</span>}</td>
     <td><button type="button" disabled={Boolean(d.revoked_at)||busy!==null} onClick={()=>void revoke(d)}>{busy===d.id?"Revoking…":"Revoke"}</button></td>
    </tr>)}
    {devices.devices.length===0&&<tr><td colSpan={5}>No registered devices yet.</td></tr>}
    </tbody></table></div>
   <div className="devices-footnote"><Smartphone size={14}/> No background desktop agent, screen recording or keystroke monitoring is installed.</div>
  </>}
 </section>;
}
