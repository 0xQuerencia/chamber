import {useEffect,useState} from "react";
import {Bell,Check,RefreshCw} from "lucide-react";
import {getPortalNotifications,readPortalNotification} from "./api";
import type {PortalNotification} from "./types";

export default function PortalNotifications({preview,onOpenTask}:{preview:boolean;onOpenTask:(id:string)=>void}){
 const [items,setItems]=useState<PortalNotification[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;
  if(preview)return;
  void getPortalNotifications().then(d=>{if(active)setItems(d.notifications)})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))});
  return()=>{active=false};
 },[preview,version]);
 const unread=items.filter(x=>!x.read_at);
 async function mark(item:PortalNotification){
  if(preview||busy)return;
  setBusy(true);setError("");
  try{await readPortalNotification(item.id);setItems(old=>old.map(x=>x.id===item.id?{...x,read_at:new Date().toISOString()}:x))}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <section className="portal-alerts" aria-label="Client upload notifications">
  <header><h2><Bell size={15}/> Client uploads <span>{unread.length} unread</span></h2>
   <button type="button" disabled={preview||busy} aria-label="Refresh notifications" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={13}/></button></header>
  {error&&<div className="alert" role="alert">{error}</div>}
  {preview?<p className="muted small">Notifications are available after signing in.</p>:!unread.length?<p className="muted small">No unreviewed client uploads.</p>:
   unread.slice(0,8).map(item=><div key={item.id} className="portal-alert-entry">
    <div><strong>{item.message}</strong><small>{new Date(item.created_at).toLocaleString("en-IN")} · Pending malware scan</small></div>
    <button type="button" onClick={()=>onOpenTask(item.task_id)}>Open assignment</button>
    <button type="button" aria-label="Mark notification read" disabled={busy} onClick={()=>void mark(item)}><Check size={14}/></button>
   </div>)}
 </section>;
}
