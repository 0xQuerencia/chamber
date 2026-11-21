import { useEffect, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowDownToLine, FileCheck2, FilePlus2, FileWarning, RefreshCw } from "lucide-react";
import { evidenceDownloadUrl, getEvidenceFiles, uploadEvidence } from "./api";
import type { StoredDocument } from "./types";
const accepted=".pdf,.jpg,.jpeg,.png,.csv,.xlsx";
function size(bytes:number){return bytes>=1024*1024?(bytes/(1024*1024)).toFixed(1)+" MB":Math.ceil(bytes/1024)+" KB"}
export default function FileEvidence({requirementId,preview}:{requirementId:string;preview:boolean}){
 const [open,setOpen]=useState(false);
 const [files,setFiles]=useState<StoredDocument[]>([]);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [rev,setRev]=useState(0);
 useEffect(()=>{
  if(!open||preview)return;
  let active=true;setLoading(true);setError("");
  void getEvidenceFiles(requirementId).then(r=>{if(active)setFiles(r.files)})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[open,preview,requirementId,rev]);
 async function change(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;
  setError("");setMessage("");setBusy(true);
  try{
   const upload=await uploadEvidence(requirementId,file);
   setMessage(upload.filename+" uploaded to quarantine; it is not available until scanned.");
   setRev(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false);e.target.value=""}
 }
 return <div className="evidence-attachments">
  <button type="button" className="evidence-toggle" onClick={()=>setOpen(v=>!v)}>
   <FilePlus2 size={13}/> {open?"Hide files":"Files / upload"}
  </button>
  {open&&<section className="evidence-content">
   <p className="evidence-info">Uploads are private. Files remain quarantined until an approved malware scanner confirms they are clean.</p>
   {!preview&&<label className="evidence-picker">Attach evidence (.pdf, images, .csv, .xlsx; 15 MB maximum)
    <input type="file" disabled={busy} accept={accepted} onChange={e=>void change(e)}/>
   </label>}
   {error&&<p className="evidence-error" role="alert">{error}</p>}
   {message&&<p className="evidence-success" role="status">{message}</p>}
   {loading&&<p className="evidence-info">Loading files…</p>}
   {files.map(file=><div key={file.id} className="evidence-file">
    <span>{file.scan_status==="clean"?<FileCheck2 size={15}/>:file.scan_status==="infected"?<AlertTriangle size={15}/>:<FileWarning size={15}/>}</span>
    <div><strong>{file.filename}</strong><small>{size(file.size_bytes)} · {file.scan_status==="clean"?"Scan passed":file.scan_status==="pending"?"Awaiting malware scan":file.scan_status==="infected"?"Rejected as infected":"Scan failed"}</small></div>
    {file.scan_status==="clean"&&<a href={evidenceDownloadUrl(file.id)} title={"Download "+file.filename}><ArrowDownToLine size={15}/></a>}
   </div>)}
   {files.length===0&&!loading&&<p className="evidence-info">No evidence uploaded yet.</p>}
   {!preview&&<button type="button" onClick={()=>setRev(r=>r+1)} className="evidence-refresh"><RefreshCw size={12}/> Refresh scan status</button>}
  </section>}
 </div>;
}
