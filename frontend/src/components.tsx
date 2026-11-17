import { useEffect, useRef, type ReactNode } from "react";
import { animate, createScope } from "animejs";
import { ArrowDownToLine, Building2, X } from "lucide-react";
import type { DocumentStatus, Priority, TaskStatus } from "./types";

export function StatusBadge({status}:{status:TaskStatus|DocumentStatus|Priority|string}){
 const labels:Record<string,string>={todo:"Pending",in_progress:"In progress",waiting:"Waiting for client",blocked:"Blocked",review:"In review",done:"Completed",missing:"Missing",requested:"Requested",received:"Received",verified:"Verified",rejected:"Rejected",not_applicable:"Not applicable",high:"High",medium:"Medium",low:"Low"};
 return <span className={"tag "+status}>{labels[status]??status}</span>;
}
export function Button({children,onClick,kind="",disabled=false,type="button"}:{children:ReactNode;onClick?:()=>void;kind?:string;disabled?:boolean;type?:"button"|"submit"}){
 return <button type={type} className={"btn "+kind} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function Heading({title,subtitle,actions}:{title:string;subtitle:string;actions?:ReactNode}){
 return <div className="page-heading"><div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="actions">{actions}</div></div>;
}
export function Empty({title="No records yet",message="Create a new record to get started."}:{title?:string;message?:string}){
 return <div className="empty"><Building2 aria-hidden="true"/><strong>{title}</strong><p>{message}</p></div>;
}
export function Panel({title,actions,children}:{title:string;actions?:ReactNode;children:ReactNode}){
 return <section className="panel"><div className="panel-pad"><div className="panel-title"><h2>{title}</h2>{actions}</div>{children}</div></section>;
}
export interface Column<T> {key:string;title:string;render:(row:T)=>ReactNode}
export function Register<T extends {id:string}>({columns,rows,empty="No records yet",footnote}:{columns:Column<T>[];rows:T[];empty?:string;footnote?:string}){
 if(rows.length===0)return <div className="panel"><Empty title={empty}/></div>;
 return <div className="panel"><div className="grid-table-wrap"><table className="data-table"><thead><tr>{columns.map(c=><th scope="col" key={c.key}>{c.title}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}>{columns.map(c=><td key={c.key}>{c.render(row)}</td>)}</tr>)}</tbody></table></div><div className="table-footer"><span>Showing {rows.length} records</span><span>{footnote??"Firm records"}</span></div></div>;
}
export function SectionMotion({children,identity}:{children:ReactNode;identity:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!ref.current||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const scope=createScope({root:ref.current}).add(()=>{animate(".section-animate",{opacity:[0,1],y:[6,0],duration:230,ease:"out(3)"});});
  return ()=>scope.revert();
 },[identity]);
 return <div className="section-animate" ref={ref}>{children}</div>;
}
export function Dialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!ref.current||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const scope=createScope({root:ref.current}).add(()=>{
   animate(".dialog",{opacity:[0,1],y:[12,0],scale:[.985,1],duration:260,ease:"out(3)"});
  });
  return ()=>scope.revert();
 },[]);
 useEffect(()=>{
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};
  document.addEventListener("keydown",escape);
  return ()=>document.removeEventListener("keydown",escape);
 },[onClose]);
 return <div className="overlay" ref={ref} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
   <div className="dialog-header"><h2>{title}</h2><button className="close-button" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
   <div className="dialog-body">{children}</div>
  </div>
 </div>;
}
export function ExportButton({onClick}:{onClick:()=>void}){return <Button onClick={onClick}><ArrowDownToLine size={15}/> Export CSV</Button>}
export function Avatar({name}:{name:string}){return <span className="avatar">{name.split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join("").toUpperCase()}</span>}
