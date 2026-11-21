// RFC 6238 TOTP. Secrets are AES-GCM encrypted with a firm-hosted Worker secret.
// No session cookie is issued until a password and a distinct TOTP challenge pass.
const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
function base32(bytes){
 let buffer=0,bits=0,out="";
 for(const byte of bytes){
  buffer=(buffer<<8)|byte;bits+=8;
  while(bits>=5){out+=chars[(buffer>>(bits-5))&31];bits-=5}
 }
 if(bits>0)out+=chars[(buffer<<(5-bits))&31];
 return out;
}
function decode32(text){
 const normalized=String(text||"").replace(/=+$/g,"").toUpperCase();
 if(!/^[A-Z2-7]{24,64}$/.test(normalized))throw Error("Invalid MFA secret");
 let buffer=0,bits=0,bytes=[];
 for(const ch of normalized){
  buffer=(buffer<<5)|chars.indexOf(ch);bits+=5;
  if(bits>=8){bytes.push((buffer>>(bits-8))&255);bits-=8}
 }
 return new Uint8Array(bytes);
}
const base64=bytes=>btoa(String.fromCharCode(...bytes));
const unbase64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function encryptionKey(env){
 const keyText=String(env.MFA_ENCRYPTION_KEY||"");
 let raw;
 try{raw=unbase64(keyText)}catch{throw Error("MFA encryption key is not configured")}
 if(raw.length!==32)throw Error("MFA encryption key must contain 32 base64-encoded bytes");
 return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function seal(env,secret){
 const key=await encryptionKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(secret));
 return base64(iv)+"."+base64(new Uint8Array(cipher));
}
async function unseal(env,source){
 const pair=String(source||"").split(".");
 if(pair.length!==2)throw Error("MFA secret is unavailable");
 const key=await encryptionKey(env),iv=unbase64(pair[0]);
 if(iv.length!==12)throw Error("Invalid MFA IV");
 const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,unbase64(pair[1]));
 return new TextDecoder().decode(clear);
}
export async function totpCode(secret,step){
 const key=await crypto.subtle.importKey("raw",decode32(secret),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(step),false);
 const hmac=new Uint8Array(await crypto.subtle.sign("HMAC",key,counter));
 const offset=hmac.at(-1)&15;
 const n=((hmac[offset]&127)<<24)|(hmac[offset+1]<<16)|(hmac[offset+2]<<8)|hmac[offset+3];
 return String(n%1000000).padStart(6,"0");
}
export async function verifyTotp(secret,value,lastStep=null,now=Date.now()){
 const entered=String(value||"");
 if(!/^\d{6}$/.test(entered))return null;
 const current=Math.floor(now/30000);
 for(let step=current-1;step<=current+1;step++){
  if(step<=Number(lastStep??-1))continue;
  const code=await totpCode(secret,step);
  let different=0;for(let i=0;i<6;i++)different|=code.charCodeAt(i)^entered.charCodeAt(i);
  if(!different)return step;
 }
 return null;
}
export async function beginMfaChallenge(env,user,deps){
 const {output,hashToken,iso}=deps;
 await encryptionKey(env); // fail closed if the deployment has not supplied its secret
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 const mode=user.mfa_enabled_at?"verify":"enroll";
 const at=iso(),expires=new Date(Date.now()+5*60000).toISOString();
 await env.DB.batch([
  env.DB.prepare("DELETE FROM mfa_pending WHERE user_id=?").bind(user.id),
  env.DB.prepare("INSERT INTO mfa_pending(token_hash,user_id,mode,expires_at,created_at) VALUES(?,?,?,?,?)")
   .bind(await hashToken(token),user.id,mode,expires,at)
 ]);
 return output({requires_mfa:true,enrollment_required:mode==="enroll",challenge:token,expires_in_seconds:300});
}
export async function handleMfa(request,env,deps){
 const {output,fail,bodyJSON,hashToken,issueSession,iso,audit}=deps;
 if(request.method!=="POST")return fail("Not found",404);
 const pathname=new URL(request.url).pathname;
 if(!["/api/mfa/setup","/api/mfa/verify"].includes(pathname))return fail("Not found",404);
 try{await encryptionKey(env)}catch{return fail("MFA is not configured on this deployment",503)}
 const data=await bodyJSON(request),token=String(data.challenge||"");
 if(!/^[0-9a-f]{64}$/.test(token))return fail("Invalid or expired sign-in challenge",401);
 const hash=await hashToken(token);
 const p=await env.DB.prepare("SELECT p.token_hash,p.user_id,p.mode,p.secret_enc,p.attempts,p.expires_at,u.email,u.name,u.firm_id,u.role,u.mfa_secret_enc,u.mfa_enabled_at,u.mfa_last_step,u.active "+
  "FROM mfa_pending p JOIN users u ON u.id=p.user_id "+
  "WHERE p.token_hash=? AND p.expires_at>? AND p.attempts<5 AND u.active=1")
  .bind(hash,iso()).first();
 if(!p)return fail("Invalid or expired sign-in challenge",401);
 if(pathname==="/api/mfa/setup"){
  if(p.mode!=="enroll"||p.mfa_enabled_at)return fail("MFA enrollment is unavailable for this challenge",403);
  let secret,encrypted=p.secret_enc;
  if(encrypted){secret=await unseal(env,encrypted)}
  else{
   secret=base32(crypto.getRandomValues(new Uint8Array(20)));
   encrypted=await seal(env,secret);
   await env.DB.prepare("UPDATE mfa_pending SET secret_enc=? WHERE token_hash=?").bind(encrypted,hash).run();
  }
  const label=encodeURIComponent("Chamber:"+p.email);
  const uri="otpauth://totp/"+label+"?secret="+secret+"&issuer=Chamber&algorithm=SHA1&digits=6&period=30";
  return output({secret,otpauth_uri:uri,expires_in_seconds:Math.max(0,Math.floor((Date.parse(p.expires_at)-Date.now())/1000))});
 }
 if(p.mode==="enroll"&&!p.secret_enc)return fail("Start MFA enrollment first",409);
 const secret=await unseal(env,p.mode==="enroll"?p.secret_enc:p.mfa_secret_enc);
 const step=await verifyTotp(secret,data.code,p.mode==="enroll"?null:p.mfa_last_step);
 if(step===null){
  await env.DB.prepare("UPDATE mfa_pending SET attempts=attempts+1 WHERE token_hash=?").bind(hash).run();
  return fail("Invalid authenticator code",401);
 }
 const user={id:p.user_id,firm_id:p.firm_id,email:p.email,name:p.name,role:p.role};
 const at=iso();
 const updates=[
  env.DB.prepare("DELETE FROM mfa_pending WHERE token_hash=?").bind(hash),
  env.DB.prepare("UPDATE users SET mfa_last_step=? WHERE id=?").bind(step,user.id),
  await audit(env.DB,user,"mfa_verified","user",user.id)
 ];
 if(p.mode==="enroll"){
  updates.push(env.DB.prepare("UPDATE users SET mfa_secret_enc=?,mfa_enabled_at=? WHERE id=? AND mfa_enabled_at IS NULL")
   .bind(p.secret_enc,at,user.id));
  updates.push(await audit(env.DB,user,"mfa_enrolled","user",user.id));
 }
 await env.DB.batch(updates);
 return issueSession(request,env,user,data.device_label);
}
