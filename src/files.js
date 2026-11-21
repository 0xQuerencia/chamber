const MAX_BYTES=15*1024*1024;
const TYPES={
 "application/pdf":/\.pdf$/i,
 "image/jpeg":/\.(jpg|jpeg)$/i,
 "image/png":/\.png$/i,
 "text/csv":/\.csv$/i,
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":/\.xlsx$/i
};
function equal(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
 let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);
 return n===0;
}
function hex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("")}
function headerName(raw){
 let name="";
 try{name=decodeURIComponent(raw)}catch{return ""}
 return name.replace(/[\u0000-\u001f\u007f/\\]/g,"_").trim().slice(0,150);
}
async function requirementFor(db,user,reqId){
 const row=await db.prepare("SELECT d.id,d.client_id,d.task_id,d.status,t.assignee_id FROM documents d JOIN tasks t ON t.id=d.task_id AND t.firm_id=d.firm_id WHERE d.firm_id=? AND d.id=?").bind(user.firm_id,reqId).first();
 if(!row)return null;
 if(user.role!=="principal"&&user.role!=="manager"&&row.assignee_id!==user.id)return null;
 return row;
}
export async function handleFiles(request,env,user,deps){
 const {output,fail,clean,audit,id,iso}=deps;
 if(!env.FILES)return fail("Private file storage is not configured",503);
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==="/api/files/upload"&&method==="POST"){
  const reqId=clean(url.searchParams.get("requirement_id"),100),req=await requirementFor(db,user,reqId);
  if(!req)return fail("Document requirement not found or access denied",404);
  if(req.status==="verified"||req.status==="not_applicable")return fail("This requirement is already closed",409);
  const mime=(request.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase();
  const filename=headerName(request.headers.get("X-File-Name")||"");
  if(!TYPES[mime]||!filename||!TYPES[mime].test(filename))return fail("Upload a permitted PDF, JPEG, PNG, CSV or XLSX file",400);
  const length=request.headers.get("Content-Length");
  if(length!==null&&Number(length)>MAX_BYTES)return fail("File must be 15 MB or smaller",413);
  const reader=request.body?.getReader();
  if(!reader)return fail("Empty upload",400);
  let total=0;
  const chunks=[];
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_BYTES){await reader.cancel();return fail("File exceeds the 15 MB limit",413)}
   chunks.push(value);
  }
  if(total<1)return fail("Empty upload",400);
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  const sha256=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
  const fileId=id(),at=iso(),key=user.firm_id+"/"+req.id+"/"+fileId;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:"application/octet-stream"},customMetadata:{sha256}});
  try{
   await db.batch([
    db.prepare("INSERT INTO stored_documents(id,firm_id,client_id,task_id,requirement_id,storage_key,filename,mime_type,size_bytes,sha256,scan_status,uploaded_by,uploaded_via,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,'staff',?)")
      .bind(fileId,user.firm_id,req.client_id,req.task_id,req.id,key,filename,mime,bytes.byteLength,sha256,user.id,at),
    await audit(db,user,"uploaded","stored_document",fileId,{requirement_id:req.id,size_bytes:bytes.byteLength,scan_status:"pending"})
   ]);
  }catch(error){await env.FILES.delete(key);throw error}
  return output({id:fileId,status:"pending",filename,size_bytes:bytes.byteLength,message:"File quarantined until malware scan passes"},201);
 }
 if(path==="/api/files"&&method==="GET"){
  const reqId=clean(url.searchParams.get("requirement_id"),100),req=await requirementFor(db,user,reqId);
  if(!req)return fail("Document requirement not found or access denied",404);
  const files=(await db.prepare("SELECT id,filename,mime_type,size_bytes,sha256,scan_status,created_at,scanned_at FROM stored_documents WHERE firm_id=? AND requirement_id=? ORDER BY created_at DESC LIMIT 100")
   .bind(user.firm_id,reqId).all()).results;
  return output({files,download_policy:"Files are downloadable only after a successful malware scan"});
 }
 const hit=path.match(/^\/api\/files\/([a-f0-9-]+)\/download$/);
 if(hit&&method==="GET"){
  const file=await db.prepare("SELECT * FROM stored_documents WHERE firm_id=? AND id=?").bind(user.firm_id,hit[1]).first();
  if(!file)return fail("File not found",404);
  if(!(await requirementFor(db,user,file.requirement_id)))return fail("Insufficient permission",403);
  if(file.scan_status!=="clean")return fail("File is quarantined pending a clean malware scan",423);
  const obj=await env.FILES.get(file.storage_key);
  if(!obj)return fail("Object unavailable",503);
  await (await audit(db,user,"downloaded","stored_document",file.id)).run();
  return new Response(obj.body,{headers:{
   "Content-Type":file.mime_type,
   "Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename),
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
   "Cross-Origin-Resource-Policy":"same-origin"
  }});
 }
 return fail("Not found",404);
}
// The scanner callback is authenticated separately from end-user sessions.
// A scanner MUST report the SHA-256 of the exact R2 object it checked.
export async function scanCallback(request,env){
 const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(request.method!=="POST")return respond({error:"Method not allowed"},405);
 const token=request.headers.get("X-Scanner-Token")||"";
 if(!env.FILE_SCAN_SECRET||!equal(token,env.FILE_SCAN_SECRET))return respond({error:"Unauthorized"},403);
 if(!env.DB||!env.FILES)return respond({error:"Storage unavailable"},503);
 const raw=await request.text();
 if(raw.length>2048)return respond({error:"Request too large"},413);
 let data;try{data=JSON.parse(raw)}catch{return respond({error:"Invalid JSON"},400)}
 if(!/^[a-f0-9-]{36}$/.test(data.id||"")||!["clean","infected","failed"].includes(data.status)||!/^[a-f0-9]{64}$/.test(data.sha256||""))
  return respond({error:"Invalid scan result"},400);
 const file=await env.DB.prepare("SELECT * FROM stored_documents WHERE id=?").bind(data.id).first();
 if(!file)return respond({error:"File not found"},404);
 if(!equal(data.sha256,file.sha256))return respond({error:"SHA-256 mismatch"},409);
 if(file.scan_status!=="pending")return respond({error:"File already scanned"},409);
 const at=new Date().toISOString(),updates=[
  env.DB.prepare("UPDATE stored_documents SET scan_status=?,scanned_at=? WHERE id=? AND scan_status='pending'")
   .bind(data.status,at,file.id),
  env.DB.prepare("INSERT INTO activity(id,firm_id,actor_id,event,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?,?,?)")
   .bind(crypto.randomUUID(),file.firm_id,null,"scanned","stored_document",file.id,JSON.stringify({status:data.status}),at)
 ];
 if(data.status==="clean"){
  updates.push(env.DB.prepare("UPDATE documents SET status=CASE WHEN status IN ('verified','not_applicable') THEN status ELSE 'received' END,received_at=COALESCE(received_at,?),received_via=COALESCE(received_via,'upload'),updated_at=? WHERE id=? AND firm_id=?")
   .bind(at,at,file.requirement_id,file.firm_id));
 }
 await env.DB.batch(updates);
 if(data.status==="infected")await env.FILES.delete(file.storage_key);
 return respond({ok:true,status:data.status});
}
