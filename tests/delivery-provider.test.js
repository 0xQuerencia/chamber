import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {ProviderFailure,providerReady,sendGmail,sendWhatsAppTemplate,verifyMetaSignature} from "../src/delivery-provider.js";

const firm="a7e0d63a-6711-432f-b7bb-5f87dd87ce81";
const emailEnv={
 CHAMBER_ALLOW_DELIVERY:"true",GMAIL_FIRM_ID:firm,GMAIL_CLIENT_ID:"client",GMAIL_CLIENT_SECRET:"secret",
 GMAIL_REFRESH_TOKEN:"refresh",GMAIL_FROM_ADDRESS:"office@example.test"
};
test("Firm-scoped provider enablement is fail-closed",()=>{
 assert.equal(providerReady(emailEnv,"email",firm),true);
 assert.equal(providerReady(emailEnv,"email","another-firm"),false);
 assert.equal(providerReady({...emailEnv,CHAMBER_ALLOW_DELIVERY:"false"},"email",firm),false);
 assert.equal(providerReady(emailEnv,"whatsapp",firm),false);
});
test("Gmail adapter sends RFC-compliant base64url MIME using authorized mailbox",async()=>{
 const requests=[];
 const fetcher=async(url,options)=>{
  requests.push({url,options});
  return url.includes("oauth2.googleapis.com")?new Response(JSON.stringify({access_token:"access"}),{status:200}):
   new Response(JSON.stringify({id:"gmail-message-id"}),{status:200});
 };
 const result=await sendGmail(emailEnv,"client@example.test","Monthly request","Please send the invoices.",fetcher);
 assert.equal(result.status,"sent");
 assert.equal(requests.length,2);
 assert.equal(requests[1].options.headers.Authorization,"Bearer access");
 const payload=JSON.parse(requests[1].options.body);
 const decoded=Buffer.from(payload.raw.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8");
 assert.match(decoded,/To: client@example\.test/);
 assert.match(decoded,/Content-Transfer-Encoding: base64/);
 assert.equal(decoded.includes("\r\n"),true);
});
test("WhatsApp adapter requires approved positional template",async()=>{
 const env={CHAMBER_ALLOW_DELIVERY:"true",WHATSAPP_FIRM_ID:firm,WHATSAPP_TOKEN:"token",
  WHATSAPP_PHONE_ID:"12345",WHATSAPP_GRAPH_VERSION:"v27.0"};
 const fetcher=async(url,options)=>{
  assert.ok(url.endsWith("/12345/messages"));
  const p=JSON.parse(options.body);
  assert.equal(p.template.name,"monthly_documents");
  assert.deepEqual(p.template.components[0].parameters.map(v=>v.text),["Client","2026-11","Invoices","2026-11-30"]);
  return new Response(JSON.stringify({messages:[{id:"wamid-test"}]}),{status:200});
 };
 await assert.rejects(()=>sendWhatsAppTemplate(env,"919999888877",{approval_status:"unsubmitted",provider_template_id:"monthly_documents"},["a","b","c","d"],fetcher),ProviderFailure);
 const result=await sendWhatsAppTemplate(env,"+91 99998 88877",{approval_status:"approved",provider_template_id:"monthly_documents",language_code:"en_US"},
  ["Client","2026-11","Invoices","2026-11-30"],fetcher);
 assert.equal(result.provider_id,"wamid-test");
});
test("Meta webhook authentication rejects unsigned payloads",async()=>{
 const raw=JSON.stringify({entry:[],object:"whatsapp_business_account"}),secret="webhook-signature-test";
 const valid="sha256="+createHmac("sha256",secret).update(raw).digest("hex");
 assert.equal(await verifyMetaSignature(secret,raw,valid),true);
 assert.equal(await verifyMetaSignature(secret,raw+" ",valid),false);
 assert.equal(await verifyMetaSignature(secret,raw,"sha256=invalid"),false);
});
