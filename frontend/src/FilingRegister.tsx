import {useEffect,useState,type FormEvent} from "react";
import {api} from "./api";
import {Button,Heading,Register,type Column} from "./components";

type Row={id:string;title:string;client_name:string;period:string|null;service:string;due_date:string|null;evidence_count:number};
type Entry={id:string;kind:string;reference:string;filed_on:string;evidence_location:string;note:string;recorded_by:string;created_at:string};
type Result={rows:Row[];page:number;has_more:boolean};
const kindNames:Record<string,string>={return:"Return",challan:"Challan",acknowledgement:"Acknowledgement",certificate:"Certificate",other:"Other"};
export default function FilingRegister({preview,onBack}:{preview:boolean;onBack:()=>void}){
 const [query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[page,setPage]=useState(0),[rev,setRev]=useState(0);
 const [result,setResult]=useState<Result|null>(null),[selected,setSelected]=useState<Row|null>(null),[entries,setEntries]=useState<Entry[]>([]);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{
  if(preview)return;
  let active=true;setLoading(true);setResult(null);setError("");
  void api<Result>("/api/filings?q="+encodeURIComponent(query)+"&filter="+filter+"&page="+page)
   .then(r=>{if(active)setResult(r)}).catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[query,filter,page,preview,rev]);
 useEffect(()=>{
  setEntries([]);if(!selected||preview)return;
  let active=true;
  void api<{entries:Entry[]}>("/api/filings/"+encodeURIComponent(selected.id)).then(r=>{if(active)setEntries(r.entries)}).catch(e=>{if(active)setError(String(e))});
  return()=>{active=false};
 },[selected,preview,rev]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selected||preview||busy)return;
  const form=e.currentTarget,values=Object.fromEntries(new FormData(form));
  setBusy(true);setError("");setNotice("");
  try{await api("/api/filings/"+encodeURIComponent(selected.id),"POST",values);form.reset();setNotice("Evidence recorded. Portal verification is not performed by Chamber.");setRev(n=>n+1)}
  catch(e){setError(String(e))}finally{setBusy(false)}
 }
 const cols:Column<Row>[]=[
  {key:"client",title:"Client",render:r=>r.client_name},
  {key:"task",title:"Assignment",render:r=><button className="cell-link" onClick={()=>{setSelected(r);setNotice("")}}>{r.title}</button>},
  {key:"period",title:"Period",render:r=>r.period||"—"},
  {key:"service",title:"Service",render:r=>r.service},
  {key:"count",title:"Evidence entries",render:r=>r.evidence_count||"None"}
 ];
 return <section>
  <Heading title="Filing Evidence Register" subtitle="Record acknowledgements separately from assignment completion." actions={<Button onClick={onBack}>Back to compliance calendar</Button>}/>
  <p className="notice">Manual records only. An assignment marked complete is not proof of filing. Not every completed assignment requires a filing. References and evidence locations must be verified by the responsible professional.</p>
  {preview&&<p className="notice">Fictional preview: no filing records are loaded or saved.</p>}
  {error&&<p role="alert" className="alert">{error}</p>}
  {notice&&<p role="status" className="notice">{notice}</p>}
  <div className="toolbar"><input className="search" aria-label="Find completed assignments" placeholder="Client, assignment or period" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelected(null)}}/>
   <label>Evidence <select className="control" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);setSelected(null)}}><option value="all">All completed work</option><option value="unrecorded">No evidence recorded</option></select></label>
   <Button disabled={preview||loading} onClick={()=>setRev(n=>n+1)}>Refresh</Button>
  </div>
  <Register columns={cols} rows={result?.rows||[]} empty={loading?"Loading assignments…":"No matching completed assignments"}/>
  <div className="toolbar"><Button disabled={page===0||loading} onClick={()=>{setPage(p=>p-1);setSelected(null)}}>Previous</Button><span>Page {page+1}</span><Button disabled={!result?.has_more||loading} onClick={()=>{setPage(p=>p+1);setSelected(null)}}>Next</Button></div>
  {selected&&<div className="detail-card" style={{marginTop:16}}>
   <Heading title={selected.client_name+" · "+selected.title} subtitle={selected.period||"No period"} actions={<Button onClick={()=>setSelected(null)}>Close</Button>}/>
   <h3>Recorded evidence</h3>
   {entries.length===0?<p className="hint">No evidence entries loaded.</p>:entries.map(entry=><div className="stats-line" key={entry.id}><div className="grow"><strong>{kindNames[entry.kind]} · {entry.reference}</strong><p>{entry.filed_on} · Recorded by {entry.recorded_by}</p><p className="hint">Evidence location: {entry.evidence_location}</p>{entry.note&&<p>{entry.note}</p>}</div></div>)}
   <h3 style={{marginTop:16}}>Add evidence</h3>
   <form onSubmit={save} key={selected.id}><div className="fields">
    <label className="field">Type<select name="kind">{Object.entries(kindNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="field">Filing / acknowledgement reference<input name="reference" required maxLength={180}/></label>
    <label className="field">Filing date<input name="filed_on" type="date" required/></label>
    <label className="field">Evidence location (firm file reference)<input name="evidence_location" required maxLength={300}/></label>
    <label className="field">Note<input name="note" maxLength={500}/></label>
   </div><div className="form-actions"><Button type="submit" kind="primary" disabled={busy||preview}>Record evidence</Button></div></form>
   <p className="hint">Do not enter passwords, OTPs or portal login details. This register stores references, not attachments. Corrections and revised filings can be recorded as additional entries with a distinct reference.</p>
  </div>}
 </section>;
}
