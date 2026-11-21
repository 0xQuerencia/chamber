const digits="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function normalizeIdentifier(value) {
 return typeof value==="string"?value.trim().toUpperCase():"";
}
export function validPan(value) {
 return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizeIdentifier(value));
}
export function gstinCheckCharacter(first14) {
 const text=normalizeIdentifier(first14);
 if(!/^[0-9A-Z]{14}$/.test(text))return null;
 let factor=2,sum=0;
 for(let i=text.length-1;i>=0;i--){
  const value=digits.indexOf(text[i]),product=value*factor;
  sum+=Math.floor(product/36)+(product%36);
  factor=factor===2?1:2;
 }
 return digits[(36-(sum%36))%36];
}
export function validGstin(value) {
 const text=normalizeIdentifier(value);
 if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(text))return false;
 const state=Number(text.slice(0,2));
 if(state<1||state>38)return false;
 return gstinCheckCharacter(text.slice(0,14))===text[14];
}
export function validClientPhone(value) {
 const text=String(value||"").replace(/[ ()-]/g,"");
 return !text||/^\+?[0-9]{6,15}$/.test(text);
}
