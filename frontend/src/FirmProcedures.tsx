import {useEffect,useMemo,useState,type FormEvent} from "react";
import {api} from "./api";
import {Button,Panel} from "./components";
import type {Workspace} from "./types";

type Procedure={id:string;service:string;version:number;title:string;body:string;published_at:string};
export function TaskProcedure({taskId,preview}:{taskId:string;preview:boolean}){
 const [open,setOpen]=useState(false),[procedure,setProcedure]=useState<Procedure|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{
  setProcedure(null);setError("");
  if(!open||preview)return;
  let active=true;setLoading(true);
  void api<{procedure:Procedure|null}>("/api/procedures/task/"+encodeURIComponent(taskId))
   .then(r=>{if(active)setProcedure(r.procedure)}).catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[taskId,open,preview]);
 return <section style={{marginTop:12}}>
  <Button onClick={()=>setOpen(v=>!v)}>{open?"Hide firm procedure":"How to do this work"}</Button>
  {open&&<div style={{marginTop:8}}>
   {preview?<p className="hint">Sample workspace: the principal can publish internal service procedures in Settings.</p>:loading?<p className="hint">Loading procedure…</p>:error?<p className="alert" role="alert">{error}</p>:procedure?<><strong>{procedure.title}</strong><p className="hint">Current firm procedure · revision {procedure.version} · {procedure.published_at.slice(0,10)}</p><div style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{procedure.body}</div></>:<p className="hint">No procedure published for this service. Ask your reviewer for instructions.</p>}
   <p className="hint">Internal operating guidance; check current legal requirements separately.</p>
  </div>}
 </section>;
}

export default function FirmProcedures({workspace,preview}:{workspace:Workspace;preview:boolean}){
 const services=useMemo(()=>Array.from(new Set([...workspace.templates.map(t=>t.service),...workspace.tasks.map(t=>t.service)])).filter(Boolean).sort(),[workspace.templates,workspace.tasks]);
 const [service,setService]=useState(""),[versions,setVersions]=useState<Procedure[]>([]),[rev,setRev]=useState(0);
 const [title,setTitle]=useState(""),[body,setBody]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{
  setVersions([]);setTitle("");setBody("");setError("");
  if(!service||preview)return;
  let active=true;setLoading(true);
  void api<{versions:Procedure[]}>("/api/procedures?service="+encodeURIComponent(service))
   .then(r=>{if(active){setVersions(r.versions);setTitle(r.versions[0]?.title||"");setBody(r.versions[0]?.body||"")}})
   .catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[service,rev,preview]);
 async function publish(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(preview||busy||loading||!service)return;
  setBusy(true);setError("");setNotice("");
  try{const result=await api<{version:number}>("/api/procedures","POST",{service,title,body});setNotice("Published revision "+result.version+". Staff now see it from related assignments.");setRev(n=>n+1)}
  catch(e){setError(String(e))}finally{setBusy(false)}
 }
 return <Panel title="Firm procedures">
  <p className="muted small">Publish your firm's preparation steps, evidence requirements, common mistakes and review instructions. Staff can open the latest revision from their assignments. Earlier revisions remain recorded.</p>
  {error&&<p role="alert" className="alert">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  <label className="field">Service<select value={service} disabled={busy} onChange={e=>{setService(e.target.value);setNotice("")}}><option value="">Choose an existing service</option>{services.map(s=><option key={s}>{s}</option>)}</select></label>
  {service&&<form onSubmit={publish}>
   <p className="hint">{loading?"Loading revisions…":versions.length?"Editing a new revision based on the latest published version.":"No published revisions loaded."}</p>
   <label className="field">Procedure title<input value={title} maxLength={140} required disabled={busy||loading||preview} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="field">Internal instructions<textarea value={body} rows={10} maxLength={10000} required disabled={busy||loading||preview} onChange={e=>setBody(e.target.value)} placeholder={"1. Check the client data and reporting period.\n2. Prepare the working file.\n3. Attach evidence and submit for review."}/></label>
   <p className="hint">Use firm-approved instructions only. Never include client-specific secrets or portal credentials. Publishing makes the new revision visible immediately to staff with access to matching assignments.</p>
   <Button type="submit" kind="primary" disabled={busy||loading||preview||!title.trim()||!body.trim()}>Publish revision</Button>
  </form>}
  {versions.length>0&&<div style={{marginTop:14}}><h3>Revision history (latest 20)</h3>{versions.map(v=><details key={v.id}><summary>Revision {v.version} · {v.title} · {v.published_at.slice(0,10)}</summary><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{v.body}</p></details>)}</div>}
 </Panel>;
}
