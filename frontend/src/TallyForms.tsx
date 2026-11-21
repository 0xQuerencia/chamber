import {useEffect,useMemo,useState} from "react";
import type {Requirement,Workspace} from "./types";
type Props={workspace:Workspace;preview:boolean;onAdvanced:()=>void};
const monthNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const baseRows=["Sales register","Purchase register","Bank statement","Expense bills"];
const labels:Record<string,string>={Y:"✓ Received",N:"✕ Not received",P:"◐ Partially received",A:"– Not applicable"};
function months(){const d=new Date();return Array.from({length:6},(_,i)=>{const m=new Date(d.getFullYear(),d.getMonth()-1-i,1);return {value:m.getFullYear()+"-"+String(m.getMonth()+1).padStart(2,"0"),label:monthNames[m.getMonth()]+"-"+String(m.getFullYear()).slice(-2)}});}
function periodKey(p:string|null){if(!p)return null;if(/^\d{4}-\d{2}$/.test(p))return p;const m=/^([a-z]{3})\s+(\d{4})$/i.exec(p);if(!m)return null;const i=monthNames.findIndex(x=>x.toLowerCase()===m[1].toLowerCase());return i<0?null:m[2]+"-"+String(i+1).padStart(2,"0");}
function docsFor(w:Workspace,client:string,period:string){const ids=new Set(w.tasks.filter(t=>t.client_id===client&&periodKey(t.period)===period).map(t=>t.id));return w.documents.filter(d=>d.client_id===client&&ids.has(d.task_id));}
function needs(d:Requirement){return !["received","verified","not_applicable"].includes(d.status);}
function date(){return new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function useAccept(advanced:()=>void){useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.key.toLowerCase()==="a"&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLSelectElement)){e.preventDefault();advanced();}};document.addEventListener("keydown",fn);return()=>document.removeEventListener("keydown",fn);},[advanced]);}
export function TallyRequestVoucher({workspace,preview,onAdvanced}:Props){
 const periods=useMemo(months,[]),[period,setPeriod]=useState(periods[0].value);
 const [clients,setClients]=useState<(string|null)[]>(()=>Array.from({length:5},(_,i)=>workspace.clients[i]?.id||null));
 const [focus,setFocus]=useState(1);useAccept(onAdvanced);
 const chosen=clients[Math.max(0,Math.min(4,focus-1))]||clients.find(Boolean)||null;
 const client=workspace.clients.find(c=>c.id===chosen);
 const missing=(id:string)=>docsFor(workspace,id,period).filter(needs).map(d=>d.name);
 const periodLabel=periods.find(x=>x.value===period)?.label||period;
 return <div className="tp-voucher">
  <section className="tp-sheet">
   <div className="tp-panel-title tp-voucher-head"><span>Data Request</span><span>No. 24 · {date()}</span></div>
   <div className="tp-form-line"><span className="tp-form-label">Firm</span>: {workspace.firm.name}</div>
   <div className="tp-form-line"><span className="tp-form-label">Channel</span>: WhatsApp</div>
   <div className="tp-form-line"><label htmlFor="tp-month-ask" className="tp-form-label">Period</label>: <select id="tp-month-ask" value={period} onChange={e=>setPeriod(e.target.value)}>{periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
   <table className="tp-voucher-table"><thead><tr><th>Sr</th><th>Client</th><th>Contact</th><th>Documents required</th></tr></thead><tbody>
   {clients.map((id,i)=>{const c=workspace.clients.find(x=>x.id===id);return <tr key={i} className={focus===i+1?"tp-selected":""} onClick={()=>setFocus(i+1)}><td>{i+1}</td><td><select aria-label={"Client "+(i+1)} value={id||""} onChange={e=>setClients(old=>old.map((x,j)=>j===i?(e.target.value||null):x))}><option value="">— Select —</option>{workspace.clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></td><td>{c?.phone||"—"}</td><td>{c?missing(c.id).join(", ")||"None pending":""}</td></tr>})}
   </tbody></table>
   <button type="button" className="tp-voucher-submit" onClick={onAdvanced}>Create request for {clients.filter(Boolean).length} client(s) · Enter or Ctrl+A</button>
  </section>
  <section className="tp-sheet tp-voucher-preview"><b>WhatsApp message preview</b><p>{client?"Hello "+client.name+", for "+periodLabel+" we still need: "+(missing(client.id).join(", ")||"nothing pending")+". Please share these at the earliest. — "+workspace.firm.name:"Select a client to preview the message."}</p></section>
  <p className="tp-voucher-foot">{preview?"Read-only sample; nothing is sent.":"Continue to the secure sending workflow. No messages are sent directly from this screen."}</p>
 </div>;
}
type ReceiptRow={id:string;name:string;status:string;remark:string};
function fromDoc(d:Requirement):ReceiptRow{return {id:d.id,name:d.name,status:["received","verified"].includes(d.status)?"Y":d.status==="not_applicable"?"A":d.status==="requested"?"P":"N",remark:""};}
export function TallyReceivedVoucher({workspace,preview,onAdvanced}:Props){
 const periods=useMemo(months,[]),[period,setPeriod]=useState(periods[0].value);
 const [client,setClient]=useState(workspace.clients[0]?.id||""),[reference,setReference]=useState(""),[focus,setFocus]=useState(3);
 const actual=useMemo(()=>docsFor(workspace,client,period),[workspace,client,period]);
 const [changes,setChanges]=useState<Record<string,ReceiptRow>>({});
 const base=actual.length?actual.map(fromDoc):baseRows.map((name,i)=>({id:"sample-"+i,name,status:"N",remark:""}));
 const rows=base.map(r=>changes[r.id]||r);
 const changeRow=(r:ReceiptRow)=>setChanges(old=>({...old,[r.id]:r}));
 useAccept(onAdvanced);
 useEffect(()=>{
  const fn=(e:KeyboardEvent)=>{
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.altKey||e.ctrlKey||e.metaKey)return;
   if(e.key==="ArrowUp"){e.preventDefault();setFocus(v=>Math.max(0,v-1));}
   if(e.key==="ArrowDown"){e.preventDefault();setFocus(v=>Math.min(rows.length+2,v+1));}
   const key=e.key.toUpperCase();
   if(key.length===1&&"YNPA".includes(key)&&rows[focus-3]){e.preventDefault();changeRow({...rows[focus-3],status:key});setFocus(v=>Math.min(rows.length+2,v+1));}
  };
  document.addEventListener("keydown",fn);return()=>document.removeEventListener("keydown",fn);
 },[rows,focus]);
 return <div className="tp-voucher">
  <section className="tp-sheet">
   <div className="tp-panel-title tp-voucher-head"><span>Data Received</span><span>No. 118 · {date()}</span></div>
   <div className="tp-form-line"><label htmlFor="tp-receipt-client" className="tp-form-label">Client</label>: <select id="tp-receipt-client" value={client} onChange={e=>{setClient(e.target.value);setChanges({})}}>{workspace.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
   <div className="tp-form-line"><label htmlFor="tp-receipt-month" className="tp-form-label">Month</label>: <select id="tp-receipt-month" value={period} onChange={e=>{setPeriod(e.target.value);setChanges({})}}>{periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
   <div className="tp-form-line"><label htmlFor="tp-receipt-ref" className="tp-form-label">Reference</label>: <input id="tp-receipt-ref" className="tp-inline-input" value={reference} onChange={e=>setReference(e.target.value)}/></div>
   <table className="tp-voucher-table"><thead><tr><th>Document requested</th><th>Status (Y N P A)</th><th>Remarks</th></tr></thead><tbody>
   {rows.map((r,i)=><tr key={r.id} className={focus===i+3?"tp-selected":""} onClick={()=>setFocus(i+3)}><td>{r.name}</td><td><select aria-label={"Status for "+r.name} value={r.status} onChange={e=>changeRow({...r,status:e.target.value})}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td><td><input className="tp-remark-input" aria-label={"Remarks for "+r.name} value={r.remark} onChange={e=>changeRow({...r,remark:e.target.value})}/></td></tr>)}
   </tbody></table>
   <button type="button" className="tp-voucher-submit" onClick={onAdvanced}>Ctrl+A · Open verified Data Received</button>
  </section>
  <p className="tp-voucher-foot">{preview?"Read-only sample; entries are not saved.":"Use the verified inward register to save and audit document receipts."}{!actual.length?" No configured checklist for this month.":""}</p>
 </div>;
}
