// Firm-owned Gmail and official WhatsApp Cloud API adapters.
// Provider acceptance is recorded as "sent" only, never as delivery or read.
const inputEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const phoneNumber=/^\+?[0-9]{6,15}$/;
const codeVersion=/^v[0-9]{2,3}\.[0-9]$/;
const encodeB64=bytes=>btoa(String.fromCharCode(...bytes));
const b64Url=text=>encodeB64(new TextEncoder().encode(text)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const safeField=text=>String(text||"").replace(/[\r\n\x00-\x1f\x7f]/g," ").trim();
export class ProviderFailure extends Error {
 constructor(message,retryable=false){super(message);this.name="ProviderFailure";this.retryable=retryable}
}
export function providerReady(env,channel,firmId){
 if(String(env.CHAMBER_ALLOW_DELIVERY||"")!=="true")return false;
 if(channel==="email")return Boolean(env.GMAIL_FIRM_ID===firmId&&env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REFRESH_TOKEN&&inputEmail.test(String(env.GMAIL_FROM_ADDRESS||"")));
 if(channel==="whatsapp")return Boolean(env.WHATSAPP_FIRM_ID===firmId&&env.WHATSAPP_TOKEN&&env.WHATSAPP_PHONE_ID&&codeVersion.test(String(env.WHATSAPP_GRAPH_VERSION||"")));
 return false;
}
async function gmailToken(env,fetcher){
 const payload=new URLSearchParams({
  client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,
  refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:"refresh_token"
 });
 let response;
 try{response=await fetcher("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:payload
 })}catch{throw new ProviderFailure("Gmail authentication network error",true)}
 if(!response.ok)throw new ProviderFailure("Gmail authentication was rejected. Reconnect the firm's mailbox.",response.status===429||response.status>=500);
 const json=await response.json().catch(()=>null);
 if(!json?.access_token)throw new ProviderFailure("Gmail token response was invalid",false);
 return json.access_token;
}
export async function sendGmail(env,recipient,subject,body,fetcher=fetch){
 if(!inputEmail.test(recipient))throw new ProviderFailure("Invalid email recipient",false);
 const sender=safeField(env.GMAIL_FROM_ADDRESS);
 if(!inputEmail.test(sender))throw new ProviderFailure("Gmail sender is not configured",false);
 const fromLabel="Chamber <"+sender+">";
 const lines=[
  "From: "+fromLabel,
  "To: "+safeField(recipient),
  "Subject: =?UTF-8?B?"+encodeB64(new TextEncoder().encode(String(subject).slice(0,160)))+"?=",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: base64",
  ...(env.GMAIL_REPLY_TO&&inputEmail.test(env.GMAIL_REPLY_TO)?["Reply-To: "+env.GMAIL_REPLY_TO]:[]),
  "",
  encodeB64(new TextEncoder().encode(body))
 ];
 const token=await gmailToken(env,fetcher);
 let response;
 try{response=await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
  method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({raw:b64Url(lines.join("\r\n"))})
 })}catch{throw new ProviderFailure("Gmail request failed over the network",true)}
 if(!response.ok){
  if(response.status===401||response.status===403)throw new ProviderFailure("Gmail access expired or lacks send permission",false);
  throw new ProviderFailure("Gmail send rejected ("+response.status+")",response.status===429||response.status>=500);
 }
 const result=await response.json().catch(()=>null);
 if(!result?.id)throw new ProviderFailure("Gmail returned no message identifier",true);
 return {provider_id:result.id,accepted_at:new Date().toISOString(),status:"sent"};
}
export async function sendWhatsAppTemplate(env,recipient,template,variables,fetcher=fetch){
 const phone=String(recipient||"").replace(/\D/g,"");
 if(!phoneNumber.test(phone))throw new ProviderFailure("Invalid WhatsApp recipient",false);
 if(!template||template.approval_status!=="approved"||!/^[a-z0-9_]{1,512}$/.test(String(template.provider_template_id||"")))
  throw new ProviderFailure("An approved WhatsApp Business template is required",false);
 if(!Array.isArray(variables)||variables.length!==4||variables.some(v=>typeof v!=="string"||v.length>1000))
  throw new ProviderFailure("WhatsApp template requires four valid variables",false);
 const version=env.WHATSAPP_GRAPH_VERSION;
 if(!codeVersion.test(String(version||"")))throw new ProviderFailure("WhatsApp Graph API version is not configured",false);
 const payload={
  messaging_product:"whatsapp",to:phone,type:"template",
  template:{name:template.provider_template_id,language:{code:template.language_code||"en"},
   components:[{type:"body",parameters:variables.map(v=>({type:"text",text:v}))}]}
 };
 let response;
 try{response=await fetcher("https://graph.facebook.com/"+version+"/"+encodeURIComponent(env.WHATSAPP_PHONE_ID)+"/messages",{
  method:"POST",headers:{"Authorization":"Bearer "+env.WHATSAPP_TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(payload)
 })}catch{throw new ProviderFailure("WhatsApp transport unavailable",true)}
 if(!response.ok){
  if(response.status===400||response.status===401||response.status===403)
   throw new ProviderFailure("WhatsApp rejected the approved template or account credentials",false);
  throw new ProviderFailure("WhatsApp provider error ("+response.status+")",response.status===429||response.status>=500);
 }
 const json=await response.json().catch(()=>null);
 if(!json?.messages?.[0]?.id)throw new ProviderFailure("WhatsApp returned no message ID",true);
 return {provider_id:json.messages[0].id,accepted_at:new Date().toISOString(),status:"sent"};
}
export async function sendWithProvider(env,message,template,fetcher=fetch){
 if(!providerReady(env,message.channel,message.firm_id))throw new ProviderFailure("Delivery is not enabled for this firm",false);
 if(message.channel==="email"){
  const subject="Chamber document request — "+message.period;
  return sendGmail(env,message.recipient,subject,message.body,fetcher);
 }
 const variables=JSON.parse(message.template_params||"null");
 return sendWhatsAppTemplate(env,message.recipient,template,variables,fetcher);
}
export async function sendPortalOtp(env,firmId,recipient,code,fetcher=fetch){
 if(!providerReady(env,"email",firmId))throw new ProviderFailure("Client portal email verification is not configured",false);
 if(!/^[0-9]{6}$/.test(code))throw new ProviderFailure("Invalid verification code",false);
 return sendGmail(env,recipient,"Chamber secure document access",
  "Your Chamber verification code is "+code+".\n\nIt expires in 5 minutes. If you did not request access, ignore this email.\nNever share this code.",fetcher);
}
export async function verifyMetaSignature(appSecret,raw,provided){
 if(!appSecret||typeof provided!=="string"||!/^sha256=[a-f0-9]{64}$/.test(provided))return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(appSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
 const expected="sha256="+[...digest].map(x=>x.toString(16).padStart(2,"0")).join("");
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^provided.charCodeAt(i);
 return expected.length===provided.length&&diff===0;
}
