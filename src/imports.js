import { normalizeIdentifier,validPan,validGstin,validClientPhone } from "./client-validation.js";

// Client import is split into small, idempotent, firm-scoped D1 batches.
// A source_index identifies one spreadsheet row across retries.
export async function handleImports(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail,csvCell}=deps;
 const db=env.DB,path=new URL(request.url).pathname,method=request.method;
 if(user.role!=="principal")return fail("Only principal may import firm-wide client records",403);
 const batchMatch=path.match(/^\/api\/imports\/([a-f0-9-]+)(?:\/(rows|complete|undo|errors))?$/);

 async function findBatch(batchId){
  return db.prepare("SELECT * FROM import_batches WHERE firm_id=? AND id=?").bind(user.firm_id,batchId).first();
 }
 function readRow(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {problems:["Expected a row object"],row:null};
  const index=Number(raw.source_index);
  const name=clean(raw.name,150),category=clean(raw.category||"Business",50);
  const pan=normalizeIdentifier(clean(raw.pan,20)),gstin=normalizeIdentifier(clean(raw.gstin,20));
  const email=clean(raw.email,200),phone=clean(raw.phone,30);
  const code=clean(raw.code,40).toUpperCase(),group=clean(raw.client_group,120),notes=clean(raw.notes,1000);
  const problems=[];
  if(!Number.isInteger(index)||index<2||index>100002)problems.push("Invalid source row number");
  if(!name)problems.push("Client name is required");
  if(pan&&!validPan(pan))problems.push("Invalid PAN");
  if(gstin&&!validGstin(gstin))problems.push("Invalid GSTIN checksum");
  if(email&&!validEmail(email))problems.push("Invalid email");
  if(!validClientPhone(phone))problems.push("Invalid phone");
  if(code&&!/^[-A-Z0-9_]+$/.test(code))problems.push("Invalid client code");
  return {row:{source_index:index,name,category,pan,gstin,email,phone,code,client_group:group,notes},problems};
 }
 async function checkRows(input){
  if(!Array.isArray(input)||!input.length||input.length>40)
   return {error:"Provide 1–40 client rows per request"};
  const entries=[];
  const seenIndexes=new Set(),seenKeys=new Set();
  for(const raw of input){
   const parsed=readRow(raw),row=parsed.row;
   const problems=[...parsed.problems],index=row?.source_index??(Number(raw?.source_index)||0);
   if(row){
    if(seenIndexes.has(index))problems.push("Repeated spreadsheet row index");
    seenIndexes.add(index);
    const identifiers=[row.code?"code:"+row.code:null,row.pan?"pan:"+row.pan:null,row.gstin?"gstin:"+row.gstin:null].filter(Boolean);
    for(const key of identifiers){if(seenKeys.has(key))problems.push("Duplicate identifier in this chunk");seenKeys.add(key)}
    if(!problems.length){
     const exists=await db.prepare("SELECT id FROM clients WHERE firm_id=? AND archived_at IS NULL AND ((code=? AND ?!='') OR (pan=? AND ?!='') OR (gstin=? AND ?!='')) LIMIT 1")
      .bind(user.firm_id,row.code,row.code,row.pan,row.pan,row.gstin,row.gstin).first();
     if(exists)problems.push("Client code, PAN or GSTIN already in Client Master");
    }
   }
   entries.push({index,row,problems});
  }
  return {entries};
 }

 if(path==="/api/imports/template"&&method==="GET"){
  const csv="code,name,category,client_group,pan,gstin,email,phone,notes\r\n";
  await (await audit(db,user,"exported","template","client_import")).run();
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=chamber-clients-template.csv","Cache-Control":"no-store"}});
 }
 if(path==="/api/imports"&&method==="GET"){
  const batches=(await db.prepare("SELECT id,kind,status,created_at,completed_at,undone_at FROM import_batches WHERE firm_id=? ORDER BY created_at DESC LIMIT 30")
   .bind(user.firm_id).all()).results;
  return output({batches});
 }
 if(path==="/api/imports/validate"&&method==="POST"){
  const data=await bodyJSON(request),checked=await checkRows(data.rows);
  if(checked.error)return fail(checked.error);
  const entries=checked.entries.map(e=>({index:e.index,errors:e.problems}));
  return output({accepted:entries.filter(e=>e.errors.length===0).length,rejected:entries.filter(e=>e.errors.length>0).length,rows:entries});
 }
 if(path==="/api/imports"&&method==="POST"){
  const data=await bodyJSON(request);
  if(data.kind!=="clients")return fail("Only client imports are supported");
  const batchId=id(),at=iso();
  await db.batch([
   db.prepare("INSERT INTO import_batches(id,firm_id,kind,created_by,status,created_at) VALUES(?,?,?,?,'open',?)")
    .bind(batchId,user.firm_id,"clients",user.id,at),
   await audit(db,user,"started","import_batch",batchId,{kind:"clients"})
  ]);
  return output({id:batchId},201);
 }
 if(!batchMatch)return fail("Not found",404);
 const batch=await findBatch(batchMatch[1]),action=batchMatch[2]||"";
 if(!batch)return fail("Import batch not found",404);
 if(action==="errors"&&method==="GET"){
  const errors=(await db.prepare("SELECT source_index,reasons FROM import_errors WHERE firm_id=? AND batch_id=? ORDER BY source_index").bind(user.firm_id,batch.id).all()).results;
  const csv=["row,errors",...errors.map(e=>csvCell(e.source_index)+","+csvCell(JSON.parse(e.reasons).join("; ")))].join("\r\n");
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=chamber-import-errors.csv","Cache-Control":"no-store"}});
 }
 if(action==="rows"&&method==="POST"){
  if(batch.status!=="open")return fail("Import is already finalized",409);
  const data=await bodyJSON(request),check=await checkRows(data.rows);
  if(check.error)return fail(check.error);
  const accepted=[],rejected=[],already=[];
  const at=iso();
  const statements=[];
  for(const entry of check.entries){
   const index=entry.index;
   const prior=await db.prepare("SELECT id FROM import_rows WHERE firm_id=? AND batch_id=? AND source_index=?").bind(user.firm_id,batch.id,index).first();
   if(prior){already.push(index);continue;}
   if(entry.problems.length){
    rejected.push({index,errors:entry.problems});
    statements.push(db.prepare("INSERT INTO import_errors(id,firm_id,batch_id,source_index,reasons,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(batch_id,source_index) DO UPDATE SET reasons=excluded.reasons")
      .bind(id(),user.firm_id,batch.id,index,JSON.stringify(entry.problems),at));
    continue;
   }
   const row=entry.row,clientId=id(),code=row.code||"CL-"+clientId.slice(0,8).toUpperCase();
   accepted.push(index);
   statements.push(db.prepare("INSERT INTO clients(id,firm_id,name,category,pan,gstin,email,phone,notes,code,client_group,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(clientId,user.firm_id,row.name,row.category,row.pan||null,row.gstin||null,row.email||null,row.phone||null,row.notes||null,code,row.client_group||null,at,at));
   statements.push(db.prepare("INSERT INTO import_rows(id,firm_id,batch_id,source_index,client_id,created_at) VALUES(?,?,?,?,?,?)")
    .bind(id(),user.firm_id,batch.id,index,clientId,at));
  }
  if(statements.length){
   statements.push(await audit(db,user,"imported","import_batch",batch.id,{accepted:accepted.length,rejected:rejected.length}));
   try{await db.batch(statements)}catch(e){
    if(/UNIQUE|constraint failed/.test(String(e)))return fail("Duplicate client detected while importing. Refresh the preview.",409);
    throw e;
   }
  }
  return output({accepted:accepted.length,rejected,already:already.length});
 }
 if(action==="complete"&&method==="POST"){
  if(batch.status!=="open")return fail("Import already finalized",409);
  const at=iso();
  await db.batch([
   db.prepare("UPDATE import_batches SET status='complete',completed_at=? WHERE firm_id=? AND id=?").bind(at,user.firm_id,batch.id),
   await audit(db,user,"completed","import_batch",batch.id)
  ]);
  const imported=await db.prepare("SELECT COUNT(*) AS n FROM import_rows WHERE firm_id=? AND batch_id=?").bind(user.firm_id,batch.id).first();
  const errors=await db.prepare("SELECT COUNT(*) AS n FROM import_errors WHERE firm_id=? AND batch_id=?").bind(user.firm_id,batch.id).first();
  return output({ok:true,imported:imported.n,errors:errors.n});
 }
 if(action==="undo"&&method==="POST"){
  if(batch.status!=="complete"||Date.now()-new Date(batch.created_at).getTime()>7*86400000)return fail("Only imports completed within seven days can be undone",409);
  if(batch.created_by!==user.id&&user.role!=="principal")return fail("Only the importing user or principal can undo",403);
  const blocked=await db.prepare("SELECT COUNT(*) AS n FROM import_rows r JOIN clients c ON c.id=r.client_id AND c.firm_id=r.firm_id WHERE r.firm_id=? AND r.batch_id=? AND (c.updated_at!=c.created_at OR EXISTS(SELECT 1 FROM tasks t WHERE t.firm_id=r.firm_id AND t.client_id=c.id))")
   .bind(user.firm_id,batch.id).first();
  if(blocked.n>0)return fail("Some imported clients were edited or assigned work. Resolve these before undo.",409);
  const at=iso();
  await db.batch([
   db.prepare("UPDATE clients SET archived_at=?,updated_at=? WHERE firm_id=? AND id IN (SELECT client_id FROM import_rows WHERE firm_id=? AND batch_id=?)")
    .bind(at,at,user.firm_id,user.firm_id,batch.id),
   db.prepare("UPDATE import_batches SET status='undone',undone_at=? WHERE firm_id=? AND id=?").bind(at,user.firm_id,batch.id),
   await audit(db,user,"undone","import_batch",batch.id)
  ]);
  return output({ok:true});
 }
 return fail("Not found",404);
}
