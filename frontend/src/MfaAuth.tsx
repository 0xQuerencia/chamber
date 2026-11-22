import {useEffect,useState,type FormEvent} from "react";
import {Check,Copy,LockKeyhole,ShieldCheck,X} from "lucide-react";
import {startMfaEnrollment,verifyMfa} from "./api";
import type {MfaEnrollment} from "./types";

export default function MfaAuth({challenge,enrollmentRequired,deviceLabel,onAuthenticated,onCancel}:{
 challenge:string;enrollmentRequired:boolean;deviceLabel:string;
 onAuthenticated:()=>Promise<void>;onCancel:()=>void
}){
 const [enrollment,setEnrollment]=useState<MfaEnrollment|null>(null);
 const [otp,setOtp]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  let alive=true;
  if(!enrollmentRequired)return;
  void startMfaEnrollment(challenge).then(r=>{if(alive)setEnrollment(r)})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e))});
  return()=>{alive=false};
 },[challenge,enrollmentRequired]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!/^\d{6}$/.test(otp)||busy)return;
  setBusy(true);setError("");
  try{
   await verifyMfa(challenge,otp,deviceLabel);
   await onAuthenticated();
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function copySecret(){
  if(!enrollment)return;
  try{await navigator.clipboard.writeText(enrollment.secret);setCopied(true)}
  catch{setError("Clipboard unavailable. Enter the setup key manually.")}
 }
 return <div className="form-screen">
  <main className="auth-card chamber-mfa" aria-label="Two-factor authentication">
   <div className="chamber-mfa-head"><div className="chamber-mfa-icon"><ShieldCheck size={23}/></div>
    <button type="button" onClick={onCancel} aria-label="Cancel sign in"><X size={18}/></button></div>
   <h1>{enrollmentRequired?"Secure your Chamber account":"Verify your identity"}</h1>
   <p>{enrollmentRequired?"Principals and managers must set up an authenticator app before Chamber will issue a sign-in session.":"Enter the six-digit code from your authenticator app to complete sign-in."}</p>
   {error&&<div className="alert" role="alert">{error}</div>}
   {enrollmentRequired&&<section className="chamber-mfa-setup" aria-label="Authenticator enrollment">
    <h2>1. Add Chamber to your authenticator</h2>
    <p>In Google Authenticator, Microsoft Authenticator, 1Password, Aegis or another TOTP app, choose <strong>Enter a setup key</strong> and paste this secret.</p>
    {!enrollment?<p className="hint">Preparing your secure setup key…</p>:
     <div className="chamber-mfa-secret"><code>{enrollment.secret.replace(/(.{4})/g,"$1 ").trim()}</code>
      <button type="button" onClick={()=>void copySecret()} aria-label="Copy authenticator setup key">
       {copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied":"Copy"}
      </button></div>}
    <p className="hint">Account type: time-based (TOTP) · 6 digits · 30-second period. Keep the setup key private; it is shown only during enrollment.</p>
   </section>}
   <form onSubmit={e=>void submit(e)}>
    <div className="chamber-mfa-code"><label htmlFor="totp-code">{enrollmentRequired?"2. Enter the current six-digit code":"Authenticator code"}</label>
     <input id="totp-code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code"
      maxLength={6} minLength={6} placeholder="000000" value={otp}
      onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} required
      aria-describedby="totp-note" disabled={busy||Boolean(enrollmentRequired&&!enrollment)} autoFocus={!enrollmentRequired}/>
     <p id="totp-note" className="hint">The code expires every 30 seconds. If it has just changed, use the newest code.</p>
    </div>
    <div className="form-actions"><button type="button" className="tracker-btn" onClick={onCancel} disabled={busy}>Cancel</button>
     <button type="submit" className="tracker-btn primary" disabled={busy||otp.length!==6||Boolean(enrollmentRequired&&!enrollment)}>
      <LockKeyhole size={15}/> {busy?"Verifying…":enrollmentRequired?"Finish secure setup":"Verify and sign in"}
     </button></div>
   </form>
   <p className="chamber-mfa-policy">Chamber does not store the authenticator key in your browser or issue a session before verification. If you lose your authenticator, contact your firm's administrator through the documented recovery process.</p>
  </main>
 </div>;
}
