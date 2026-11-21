import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, RefreshCw, Unplug } from "lucide-react";
import { connectSheets, disconnectSheets, getSheetsStatus } from "./api";
import type { SheetsStatus } from "./types";
const when=(v:string)=>new Date(v).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
export default function SheetsSettings({preview,principal}:{preview:boolean;principal:boolean}){
 const [status,setStatus]=useState<SheetsStatus|null>(null);
 const [sheetId,setSheetId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  if(!principal||preview)return;
  let live=true;setError("");
  void getSheetsStatus().then(x=>{if(live){setStatus(x);setSheetId(x.spreadsheet_id??"")}}).catch(e=>{if(live)setError(String(e))});
  return()=>{live=false};
 },[principal,preview,version]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!principal||preview)return;setBusy(true);setError("");setMessage("");
  try{await connectSheets(sheetId.trim());setMessage("Sheet connected for audit mirroring. Service account credentials and Sheet sharing must also be configured.");setVersion(v=>v+1)}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function disconnect(){
  if(!window.confirm("Pause audit mirroring to Google Sheets? The in-app audit log will remain available."))return;
  setBusy(true);setError("");setMessage("");
  try{await disconnectSheets();setMessage("Sheet mirroring paused.");setVersion(v=>v+1)}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 if(!principal)return null;
 return <section className="sheets-panel">
  <header><div><h2><FileSpreadsheet size={17}/> Google Sheets work log</h2>
   <p>Optional mirror of the append-only Chamber activity log. The database remains the source of truth.</p></div>
   <button type="button" disabled={busy||preview} onClick={()=>setVersion(v=>v+1)} title="Refresh sync status"><RefreshCw size={15}/></button></header>
  {preview?<p>Disabled in preview mode.</p>:<>
   {error&&<div className="alert" role="alert">{error}</div>}
   {message&&<p className="sheets-success" role="status">{message}</p>}
   <div className="sheets-indicators">
    <span>{status?.connected?<><CheckCircle2 size={15}/> Sheet connected</>:<><Unplug size={15}/> Not connected</>}</span>
    <span>{status?.credentials_configured?<><CheckCircle2 size={15}/> Service account configured</>:<><AlertCircle size={15}/> Server credentials needed</>}</span>
   </div>
   <form onSubmit={e=>void save(e)}>
    <label>Google spreadsheet ID <input value={sheetId} onChange={e=>setSheetId(e.target.value)} placeholder="Paste the ID from your spreadsheet URL" required minLength={15} maxLength={120} disabled={busy}/></label>
    <div className="sheets-actions"><button className="tracker-btn primary" type="submit" disabled={busy||sheetId.trim().length<15}>Connect Sheet</button>
     {status?.connected&&<button className="tracker-btn" type="button" disabled={busy} onClick={()=>void disconnect()}>Pause sync</button>}</div>
   </form>
   <p className="sheets-last">Last synced: {status?.last_synced_at?when(status.last_synced_at):"Not yet synced"}</p>
   {status?.last_error&&<p className="sheets-error">Last sync error: {status.last_error}</p>}
   <p className="sheets-note">Share the Sheet with the dedicated service-account email configured on the server. Only work-event metadata and client codes are exported; PAN, GSTIN, bank and phone details stay out of the Sheet. Security events remain in Chamber.</p>
  </>}
 </section>;
}
