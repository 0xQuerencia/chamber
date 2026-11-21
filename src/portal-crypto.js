// No raw portal link tokens or verification codes are stored in D1.
const encoder=new TextEncoder();
export const portalHex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
export function makePortalToken(){return portalHex(crypto.getRandomValues(new Uint8Array(32)))}
export async function digestPortalToken(token){
 if(typeof token!=="string"||!/^[0-9a-f]{64}$/.test(token))return null;
 return portalHex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token))));
}
export function createSixDigitCode(){
 // Rejection sampling avoids modulo bias for the six-digit challenge.
 const range=1_000_000,max=Math.floor(0x100000000/range)*range;
 let value;
 do{value=crypto.getRandomValues(new Uint32Array(1))[0]}while(value>=max);
 return String(value%range).padStart(6,"0");
}
export async function otpDigest(pepper,linkId,code){
 if(typeof pepper!=="string"||pepper.length<32)throw Error("Portal OTP pepper is not configured");
 if(!/^[0-9]{6}$/.test(String(code||"")))return null;
 const key=await crypto.subtle.importKey("raw",encoder.encode(pepper),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,encoder.encode("ChamberPortal:"+linkId+":"+code));
 return portalHex(new Uint8Array(sig));
}
export function constantMatch(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
