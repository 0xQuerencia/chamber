import { normalizeIdentifier,validPan,validGstin,validClientPhone } from "./client-validation.js";
import {canReadClient,canManageClient,validClientManager} from "./permissions.js";

// Clients, contacts and registrations are always accessed in the authenticated firm's scope.
export async function handleClientMaster(request,env,user,deps){
 const {output,fail,clean,audit,id,iso,isPrivileged,bodyJSON,validEmail}=deps;
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 const privileged=isPrivileged(user);
 const clientMatch=path.match(/^\/api\/clients\/([a-f0-9-]+)(?:\/(profile|contacts|gstins|archive))?$/);
 if(!clientMatch)return fail("Not found",404);
 const cid=clientMatch[1],action=clientMatch[2]||"";
 const client=await db.prepare("SELECT * FROM clients WHERE firm_id=? AND id=?").bind(user.firm_id,cid).first();
 if(!client)return fail("Client not found",404);
 const assigned=await canReadClient(db,user,cid);
 if(!assigned)return fail("Insufficient permission",403);

 if(action==="profile"&&method==="GET"){
  const basic=privileged?client:{
   id:client.id,name:client.name,category:client.category,code:client.code,email:client.email,phone:client.phone,created_at:client.created_at
  };
  const contacts=(await db.prepare("SELECT id,name,title,email,phone,preferred_channel,whatsapp_opt_in_at,whatsapp_opt_in_source,active FROM client_contacts WHERE firm_id=? AND client_id=? AND active=1 ORDER BY name")
    .bind(user.firm_id,cid).all()).results;
  const gstins=privileged?(await db.prepare("SELECT id,gstin,state_code FROM client_gstins WHERE firm_id=? AND client_id=? ORDER BY gstin")
    .bind(user.firm_id,cid).all()).results:[];
  return output({client:basic,contacts:privileged?contacts:contacts.map(c=>({
   id:c.id,name:c.name,title:c.title,email:c.email,phone:c.phone,preferred_channel:c.preferred_channel
  })),gstins});
 }

 if(!privileged||!(await canManageClient(db,user,cid)))return fail("Insufficient permission",403);
 if(client.archived_at&&action!=="profile")return fail("Archived client cannot be changed",409);

 if(!action&&method==="PATCH"){
  const data=await bodyJSON(request);
  const name=data.name===undefined?client.name:clean(data.name,150);
  const category=data.category===undefined?client.category:clean(data.category,50);
  const pan=data.pan===undefined?client.pan:normalizeIdentifier(clean(data.pan,20));
  const gstin=data.gstin===undefined?client.gstin:normalizeIdentifier(clean(data.gstin,20));
  const email=data.email===undefined?client.email:clean(data.email,200);
  const phone=data.phone===undefined?client.phone:clean(data.phone,30);
  const notes=data.notes===undefined?client.notes:clean(data.notes,1000);
  const code=data.code===undefined?client.code:clean(data.code,40).toUpperCase();
  const group=data.client_group===undefined?client.client_group:clean(data.client_group,120);
  const manager=user.role==="manager"?user.id:(data.manager_id===undefined?client.manager_id:clean(data.manager_id,100));
  if(!name||!category||(pan&&!validPan(pan))||(gstin&&!validGstin(gstin))||
    (email&&!validEmail(email))||!validClientPhone(phone)||!/^[-A-Z0-9_]*$/.test(code||""))
   return fail("Check client name, PAN, GSTIN, email, phone and client code");
  if(manager){
   if(!(await validClientManager(db,user.firm_id,manager)))return fail("Manager not found in firm",400);
  }
  const duplicates=await db.prepare("SELECT id FROM clients WHERE firm_id=? AND id!=? AND archived_at IS NULL AND ( (pan=? AND ?!='') OR (gstin=? AND ?!='') OR (code=? AND ?!='')) LIMIT 1")
   .bind(user.firm_id,cid,pan||"",pan||"",gstin||"",gstin||"",code||"",code||"").first();
  if(duplicates)return fail("Another client already uses this PAN, GSTIN or code",409);
  try{
   await db.batch([
    db.prepare("UPDATE clients SET name=?,category=?,pan=?,gstin=?,email=?,phone=?,notes=?,code=?,client_group=?,manager_id=?,updated_at=? WHERE firm_id=? AND id=?")
     .bind(name,category,pan||null,gstin||null,email||null,phone||null,notes||null,code||null,group||null,manager||null,iso(),user.firm_id,cid),
    await audit(db,user,"updated","client",cid,{fields:Object.keys(data).filter(x=>!["pan","gstin","notes"].includes(x))})
   ]);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("Duplicate client code",409);throw e;}
  return output({ok:true});
 }

 if(action==="archive"&&method==="POST"){
  const active=(await db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE firm_id=? AND client_id=? AND status!='done'").bind(user.firm_id,cid).first()).n;
  if(active)return fail("Complete or reassign open work before archiving this client",409);
  await db.batch([
   db.prepare("UPDATE clients SET archived_at=?,updated_at=? WHERE firm_id=? AND id=?").bind(iso(),iso(),user.firm_id,cid),
   await audit(db,user,"archived","client",cid)
  ]);
  return output({ok:true});
 }

 if(action==="contacts"&&method==="POST"){
  const data=await bodyJSON(request);
  const name=clean(data.name,100),title=clean(data.title,100),phone=clean(data.phone,30);
  const email=clean(data.email,200).toLowerCase();
  const channel=["email","whatsapp","phone"].includes(data.preferred_channel)?data.preferred_channel:"email";
  const consent=Boolean(data.whatsapp_opt_in),source=clean(data.whatsapp_opt_in_source,200);
  if(!name||(email&&!validEmail(email))||!validClientPhone(phone)||(consent&&!source))
   return fail("Valid contact name/email/phone and evidence for WhatsApp opt-in required");
  const dup=await db.prepare("SELECT id FROM client_contacts WHERE firm_id=? AND client_id=? AND active=1 AND ((email=? AND ?!='') OR (phone=? AND ?!='')) LIMIT 1")
   .bind(user.firm_id,cid,email,email,phone,phone).first();
  if(dup)return fail("Duplicate contact email or phone for client",409);
  const at=iso(),contactId=id();
  await db.batch([
   db.prepare("INSERT INTO client_contacts(id,firm_id,client_id,name,title,phone,email,preferred_channel,whatsapp_opt_in_source,whatsapp_opt_in_at,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)")
    .bind(contactId,user.firm_id,cid,name,title||null,phone||null,email||null,channel,consent?source:null,consent?at:null,at,at),
   await audit(db,user,"created","client_contact",contactId,{client_id:cid,preferred_channel:channel,whatsapp_opt_in:consent})
  ]);
  return output({id:contactId},201);
 }

 if(action==="gstins"&&method==="POST"){
  const data=await bodyJSON(request);
  const gstin=normalizeIdentifier(clean(data.gstin,20));
  if(!validGstin(gstin))return fail("Valid GSTIN with checksum required");
  const duplicate=await db.prepare("SELECT id FROM client_gstins WHERE firm_id=? AND gstin=?").bind(user.firm_id,gstin).first();
  if(duplicate)return fail("This GSTIN is already registered to a client",409);
  const gstId=id();
  try{
   await db.batch([
    db.prepare("INSERT INTO client_gstins(id,firm_id,client_id,gstin,state_code,created_at) VALUES(?,?,?,?,?,?)")
     .bind(gstId,user.firm_id,cid,gstin,gstin.slice(0,2),iso()),
    await audit(db,user,"created","client_gstin",gstId,{client_id:cid,state_code:gstin.slice(0,2)})
   ]);
  }catch(e){if(/UNIQUE|constraint failed/.test(String(e)))return fail("GSTIN already registered",409);throw e;}
  return output({id:gstId},201);
 }
 return fail("Not found",404);
}
