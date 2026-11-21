import {useEffect,useState} from "react";
import {ClipboardCopy,ExternalLink,Link2,LockKeyhole,RefreshCw,X} from "lucide-react";
import {createPortalLink,listPortalLinks,revokePortalLink} from "./api";
import type {PortalLinkRecord} from "./types";
const localMonth=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
export default function PortalLinks({clientId,preview}:{clientId:string;preview:boolean}){
 const [period,setPeriod]=useState(localMonth);
 const [days,setDays]=useState(7);
 const [links,setLinks]=useState<PortalLinkRecord[]>([]);
 const [created,setCreated]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true;
  if(preview)return;
  void listPortalLinks(clientId).then(r=>{if(active)setLinks(r.links)}).catch(e=>{if(active)setError(String(e))});
  return()=>{active=false};
 },[clientId,preview,refresh]);
 async function generate(){
  if(preview||busy)return;
  setBusy(true);setError("");setMessage("");setCreated(null);
  try{
   const result=await createPortalLink(clientId,period,days);
   setCreated(result.url);setMessage("Link created. Send privately to "+result.recipient_email+". Email OTP is required for access.");
   setRefresh(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function revoke(id:string){
  if(preview||busy||!window.confirm("Revoke this link immediately? The client will lose access."))return;
  setBusy(true);setError("");
  try{await revokePortalLink(id);setRefresh(n=>n+1);setMessage("Link revoked.")}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function copy(){
  if(!created)return;
  try{await navigator.clipboard.writeText(created);setMessage("Private link copied. Send only to the registered client contact.")}
  catch{setError("Clipboard is unavailable")}
 }
 return <section className="portal-link-manager">
  <h3><LockKeyhole size={15}/> Secure client upload links</h3>
  <p className="muted small">A private, expiring link opens only after email OTP verification. It shows this client's documents for one period. Uploads are quarantined until scanned.</p>
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="client-notice" role="status">{message}</div>}
  <div className="portal-link-create">
   <label>Period<input type="month" value={period} onChange={e=>setPeriod(e.target.value)} disabled={preview||busy}/></label>
   <label>Expires in<select value={days} onChange={e=>setDays(Number(e.target.value))} disabled={preview||busy}>
    <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option>
   </select></label>
   <button type="button" className="tracker-btn primary" disabled={preview||busy} onClick={()=>void generate()}><Link2 size={14}/> Create link</button>
  </div>
  {created&&<div className="portal-link-result">
   <p>New link · visible only until you leave this screen</p><code>{created}</code>
   <div><button type="button" className="tracker-btn" onClick={()=>void copy()}><ClipboardCopy size={13}/> Copy securely</button>
    <a className="tracker-btn" href={created} target="_blank" rel="noreferrer noopener"><ExternalLink size={13}/> Test portal</a></div>
  </div>}
  <div className="portal-link-history">
   <div><h4>Existing links</h4><button type="button" aria-label="Refresh links" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={13}/></button></div>
   {!links.length?<p className="muted small">No links have been issued yet.</p>:links.slice(0,12).map(link=><div key={link.id} className="portal-link-row">
    <span><strong>{link.period}</strong><small>{link.recipient_email} · Expires {new Date(link.expires_at).toLocaleDateString("en-IN")}</small></span>
    {link.revoked_at?<small>Revoked</small>:new Date(link.expires_at).getTime()<Date.now()?<small>Expired</small>:
     <button type="button" disabled={busy||preview} onClick={()=>void revoke(link.id)} aria-label={"Revoke link "+link.period}><X size={13}/> Revoke</button>}
   </div>)}
  </div>
 </section>;
}
