import { useMemo, useState, type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { ArrowDownToLine, CheckCircle2, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import { addImportRows, completeClientImport, importErrorsUrl, importTemplateUrl, startClientImport, undoClientImport, validateImportRows } from "./api";
import type { ImportClientRow, ImportRowIssue, Workspace } from "./types";

const fields=[
 {id:"code",label:"Client code",aliases:["clientcode","clientid","code"]},
 {id:"name",label:"Client name *",aliases:["clientname","name","legalname","partyname"]},
 {id:"category",label:"Category",aliases:["category","type","clienttype"]},
 {id:"client_group",label:"Group",aliases:["group","clientgroup"]},
 {id:"pan",label:"PAN",aliases:["pan","pannumber"]},
 {id:"gstin",label:"GSTIN",aliases:["gstin","gstnumber"]},
 {id:"email",label:"Email",aliases:["email","emailaddress"]},
 {id:"phone",label:"Phone",aliases:["phone","mobile","contactnumber"]},
 {id:"notes",label:"Notes",aliases:["notes","remarks"]}
] as const;
type FieldId=typeof fields[number]["id"];
type Mapping=Partial<Record<FieldId,number>>;
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");

function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],part="",quotes=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quotes&&text[i+1]==='"'){part+='"';i++}else quotes=!quotes}
  else if(c===","&&!quotes){row.push(part);part=""}
  else if((c==="\n"||c==="\r")&&!quotes){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row.push(part);rows.push(row);row=[];part="";
  }else part+=c;
 }
 if(part||row.length){row.push(part);rows.push(row)}
 return rows.map(r=>r.map(v=>v.trim()));
}
function detectMapping(headers:string[]):Mapping{
 const match:Mapping={};
 for(const f of fields){
  const index=headers.findIndex(h=>f.aliases.some(a=>a===normalize(h)));
  if(index>=0)match[f.id]=index;
 }
 return match;
}
function chunk<T>(array:T[],size:number){
 const groups:T[][]=[];for(let i=0;i<array.length;i+=size)groups.push(array.slice(i,i+size));
 return groups;
}
export default function ImportWizard({workspace,preview,onRefresh}:{workspace:Workspace;preview:boolean;onRefresh:()=>Promise<void>}){
 const canImport=!preview&&(workspace.user.role==="principal"||workspace.user.role==="manager");
 const [fileName,setFileName]=useState("");
 const [headers,setHeaders]=useState<string[]>([]);
 const [table,setTable]=useState<string[][]>([]);
 const [mapping,setMapping]=useState<Mapping>({});
 const [verified,setVerified]=useState(false);
 const [issues,setIssues]=useState<ImportRowIssue[]>([]);
 const [progress,setProgress]=useState(0);
 const [batchId,setBatchId]=useState<string|null>(null);
 const [complete,setComplete]=useState(false);
 const [imported,setImported]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const mappedRows=useMemo<ImportClientRow[]>(()=>{
  const result:ImportClientRow[]=[];
  table.slice(1).forEach((row,i)=>{
   const values=Object.fromEntries(fields.map(f=>[f.id,mapping[f.id]===undefined?"":String(row[mapping[f.id]!]??"").trim()]));
   if(Object.values(values).every(v=>!v))return;
   result.push({source_index:i+2,...values} as ImportClientRow);
  });
  return result;
 },[table,mapping]);
 const hasName=mapping.name!==undefined;
 async function readFile(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;
  setError("");setMessage("");setVerified(false);setIssues([]);setBatchId(null);setComplete(false);setImported(0);
  if(file.size>5*1024*1024){setError("File is larger than the 5 MB limit");return}
  setBusy(true);
  try{
   let rows:string[][];
   if(file.name.toLowerCase().endsWith(".xlsx")){
    const data=await readSheet(file);
    rows=data.map(row=>row.map(v=>v instanceof Date?v.toISOString().slice(0,10):String(v??"")));
   }else if(file.name.toLowerCase().endsWith(".csv")){
    rows=parseCsv(await file.text());
   }else throw Error("Choose a .csv or .xlsx file");
   if(rows.length<2)throw Error("Spreadsheet needs headers and at least one client row");
   if(rows.length>1001)throw Error("Import at most 1,000 clients at a time");
   setHeaders(rows[0]);setTable(rows);setMapping(detectMapping(rows[0]));setFileName(file.name);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 function setColumn(field:FieldId,value:string){
  setMapping(old=>({...old,[field]:value===""?undefined:Number(value)}));
  setVerified(false);setIssues([]);
 }
 async function dryRun(){
  if(!canImport||!hasName||!mappedRows.length)return;
  setBusy(true);setError("");setMessage("");setIssues([]);setProgress(0);
  try{
   const groups=chunk(mappedRows,40),all:ImportRowIssue[]=[];
   let accepted=0;
   for(let i=0;i<groups.length;i++){
    const result=await validateImportRows(groups[i]);
    accepted+=result.accepted;
    all.push(...result.rows.filter(r=>r.errors.length>0));
    setProgress(Math.round((i+1)/groups.length*100));
   }
   setIssues(all);setVerified(true);
   setMessage(accepted+" rows passed server validation; "+all.length+" need attention.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function commit(){
  if(!canImport||!verified||!mappedRows.length||busy||complete)return;
  setBusy(true);setError("");setMessage("");setProgress(0);
  try{
   const id=batchId??(await startClientImport()).id;
   setBatchId(id);
   const groups=chunk(mappedRows,40),all:ImportRowIssue[]=[];
   for(let i=0;i<groups.length;i++){
    const result=await addImportRows(id,groups[i]);
    all.push(...result.rejected);
    setProgress(Math.round((i+1)/groups.length*100));
   }
   const result=await completeClientImport(id);
   setIssues(all);setImported(result.imported);setComplete(true);setMessage("Import finished: "+result.imported+" clients created, "+result.errors+" rows rejected.");
   await onRefresh();
  }catch(e){
   setError((e instanceof Error?e.message:String(e))+" — If the request was interrupted, retry to resume the same import batch.");
  }finally{setBusy(false)}
 }
 async function undo(){
  if(!canImport||!batchId||!complete||busy||!window.confirm("Undo this import? Imported, unchanged clients will be archived."))return;
  setBusy(true);setError("");
  try{await undoClientImport(batchId);setComplete(false);setVerified(false);setBatchId(null);setMessage("Import undone. Imported clients were archived.");await onRefresh()}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <section className="import-screen">
  <header className="import-heading"><div><h1>Import Client Master</h1><p>Map columns, review records and import with an audit trail.</p></div>
   <a href={importTemplateUrl} className="tracker-btn"><ArrowDownToLine size={15}/> Download CSV template</a>
  </header>
  {!canImport&&<p className="tracker-notice">Only a firm principal or manager can import clients. Preview mode is read-only.</p>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="tracker-notice" role="status">{message}</div>}
  <div className="import-steps"><span className={fileName?"done":""}>1. Upload</span><span className={hasName?"done":""}>2. Map columns</span><span className={verified?"done":""}>3. Validate</span><span className={complete?"done":""}>4. Import</span></div>
  <div className="import-panel">
   <h2><UploadCloud size={17}/> Choose CSV or XLSX</h2>
   <label className="import-file">
    <FileSpreadsheet size={24}/><span>{fileName||"Choose a spreadsheet of up to 1,000 clients"}</span>
    <input type="file" accept=".csv,.xlsx" disabled={!canImport||busy} onChange={e=>void readFile(e)}/>
   </label>
   <p className="import-hint">The file is read locally. Only mapped client rows are submitted to the authenticated firm API. No original file is stored.</p>
  </div>
  {table.length>0&&<div className="import-panel">
   <h2>Map spreadsheet columns</h2><p className="import-hint">{mappedRows.length} client rows detected. Client name is required.</p>
   <div className="import-mapping">
    {fields.map(f=><label key={f.id}><span>{f.label}</span><select value={mapping[f.id]??""} onChange={e=>setColumn(f.id,e.target.value)} disabled={busy}>
     <option value="">Ignore this field</option>{headers.map((h,i)=><option key={i} value={i}>{h||"Column "+(i+1)}</option>)}
    </select></label>)}
   </div>
  </div>}
  {mappedRows.length>0&&<div className="import-panel">
   <h2>Review records</h2><div className="import-preview-scroll"><table><thead><tr><th>Row</th><th>Client code</th><th>Name</th><th>Category</th><th>PAN</th><th>GSTIN</th><th>Email</th></tr></thead>
    <tbody>{mappedRows.slice(0,10).map(r=><tr key={r.source_index}><td>{r.source_index}</td><td>{r.code||"Auto"}</td><td>{r.name}</td><td>{r.category||"Business"}</td><td>{r.pan||"—"}</td><td>{r.gstin||"—"}</td><td>{r.email||"—"}</td></tr>)}</tbody></table></div>
   {mappedRows.length>10&&<p className="import-hint">Showing the first 10 of {mappedRows.length} rows.</p>}
   <div className="import-actions">
    <button type="button" className="tracker-btn" disabled={busy||!hasName||!canImport} onClick={()=>void dryRun()}><RefreshCw size={14}/> Dry-run validation</button>
    <button type="button" className="tracker-btn primary" disabled={busy||!verified||!canImport||complete} onClick={()=>void commit()}><CheckCircle2 size={14}/> Import {mappedRows.length} rows</button>
   </div>
   {busy&&<div className="import-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:progress+"%"}}/></div>}
   {verified&&issues.length>0&&<div className="import-issues"><h3>Validation errors ({issues.length})</h3>
    {issues.slice(0,30).map((issue,i)=><p key={issue.index+"-"+i}>Row {issue.index}: {issue.errors.join("; ")}</p>)}
    {issues.length>30&&<p>Showing 30 of {issues.length} errors.</p>}
   </div>}
   {complete&&batchId&&<div className="import-complete"><p><CheckCircle2 size={16}/> {imported} clients added.</p>
    <div><a className="tracker-btn" href={importErrorsUrl(batchId)}><ArrowDownToLine size={14}/> Download error CSV</a>
     <button type="button" className="tracker-btn" onClick={()=>void undo()} disabled={busy}>Undo import (7 days)</button></div>
   </div>}
  </div>}
 </section>;
}
