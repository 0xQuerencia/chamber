import test from "node:test";
import assert from "node:assert/strict";
import {makePortalToken,digestPortalToken,createSixDigitCode,otpDigest,constantMatch} from "../src/portal-crypto.js";
test("portal URLs use unpredictable capabilities but only hashes are stored",async()=>{
 const a=makePortalToken(),b=makePortalToken();
 assert.match(a,/^[0-9a-f]{64}$/);assert.notEqual(a,b);
 const hash=await digestPortalToken(a);
 assert.match(hash,/^[0-9a-f]{64}$/);
 assert.notEqual(hash,a);
 assert.equal(await digestPortalToken("invalid"),null);
});
test("six-digit code and HMAC proof do not reveal the OTP",async()=>{
 const code=createSixDigitCode();
 assert.match(code,/^[0-9]{6}$/);
 const secret="test-pepper-32-characters-minimum-demo";
 const digest=await otpDigest(secret,"link-id",code);
 assert.match(digest,/^[0-9a-f]{64}$/);
 assert.notEqual(digest,code);
 assert.equal(constantMatch(digest,await otpDigest(secret,"link-id",code)),true);
 assert.equal(constantMatch(digest,await otpDigest(secret,"other-link",code)),false);
 assert.equal(await otpDigest(secret,"link-id","12345"),null);
 await assert.rejects(()=>otpDigest("weak","link-id",code));
});
