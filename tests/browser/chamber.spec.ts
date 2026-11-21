import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHmac} from "node:crypto";

function currentTotp(secret:string){
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 const clean=secret.replace(/[^A-Z2-7]/gi,"").toUpperCase();
 let buffer=0,bits=0,bytes:number[]=[];
 for(const char of clean){
  buffer=(buffer<<5)|alphabet.indexOf(char);bits+=5;
  if(bits>=8){bytes.push((buffer>>(bits-8))&255);bits-=8}
 }
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30_000)));
 const hmac=createHmac("sha1",Buffer.from(bytes)).update(counter).digest();
 return String((hmac.readUInt32BE(hmac[19]&15)&0x7fffffff)%1_000_000).padStart(6,"0");
}
test.describe.configure({mode:"serial"});
test("Fictional preview supports keyboard navigation and command search",async({page})=>{
 await page.goto("/?preview=1");
 await expect(page.getByText("SAMPLE DATA · READ ONLY")).toBeVisible();
 await expect(page.getByRole("main")).toBeVisible();
 await page.keyboard.press("g");await page.keyboard.press("c");
 await expect(page.getByRole("heading",{name:"Client Master"})).toBeVisible();
 await page.keyboard.press("Control+k");
 await expect(page.getByRole("dialog",{name:"Search Chamber"})).toBeVisible();
 await page.getByRole("combobox").fill("work board");
 await expect(page.getByRole("option",{name:/Work Board/i}).first()).toBeVisible();
 await page.keyboard.press("Escape");
 await page.keyboard.press("?");
 await expect(page.getByRole("dialog",{name:"Chamber keyboard shortcut guide"})).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(page.getByRole("dialog",{name:"Chamber keyboard shortcut guide"})).toHaveCount(0);
});
test("Anonymous client-upload link reveals no data before verification",async({page})=>{
 await page.goto("/#/portal/"+("a".repeat(64)));
 await expect(page.getByRole("heading",{name:"Secure document access"})).toBeVisible();
 await expect(page.getByText("Confidential upload portal")).toBeVisible();
 await expect(page.getByText(/Shah & Co/)).toHaveCount(0);
 const violations=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 expect(violations.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))).toEqual([]);
});
test("Principal signs in with TOTP, creates a client and navigates registers",async({page,request})=>{
 const origin="http://127.0.0.1:8787";
 const setup=await request.post(origin+"/api/setup",{
  headers:{"Origin":origin,"X-Setup-Token":"test-setup-token-123456789","Content-Type":"application/json"},
  data:{firm:"Browser QA and Co",name:"Browser Principal",email:"principal@browser.test",password:"browser-test-password-123"}
 });
 expect(setup.status()).toBe(201);
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Sign in to Chamber"})).toBeVisible();
 await page.locator('[name="email"]').fill("principal@browser.test");
 await page.locator('[name="password"]').fill("browser-test-password-123");
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Secure your Chamber account"})).toBeVisible();
 const secret=await page.locator(".chamber-mfa-secret code").innerText();
 await page.locator("#totp-code").fill(currentTotp(secret));
 await page.getByRole("button",{name:"Finish secure setup"}).click();
 await expect(page.locator(".tp-gateway-menu .tp-panel-title")).toHaveText("Gateway of Chamber");
 await page.locator(".tp-gateway-menu").getByRole("button",{name:"Clients",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Client Master"})).toBeVisible();
 await page.getByRole("button",{name:"New client",exact:true}).click();
 await page.locator('form [name="name"]').fill("Browser Test Enterprises");
 await page.locator('form [name="category"]').selectOption("Business");
 await page.getByRole("button",{name:"Save record"}).click();
 await expect(page.getByText("Browser Test Enterprises")).toBeVisible();
 await page.keyboard.press("F10");
 await page.locator(".tp-gateway-menu").getByRole("button",{name:"Compliance Types"}).click();
 await expect(page.getByRole("heading",{name:"Compliance Calendar"})).toBeVisible();
 await expect(page.getByText("Calendar rules and starter services")).toBeVisible();
 await page.keyboard.press("Control+k");
 await page.getByRole("dialog",{name:"Search Chamber"}).getByRole("combobox").fill("Firm Setup");
 await page.getByRole("option",{name:/Firm Setup/i}).first().click();
 await expect(page.getByRole("heading",{name:"Set up your CA firm"})).toBeVisible();
 await page.keyboard.press("Control+k");
 await page.getByRole("dialog",{name:"Search Chamber"}).getByRole("combobox").fill("Security Audit");
 await page.getByRole("option",{name:/Security Audit/i}).first().click();
 await expect(page.getByRole("heading",{name:"Security Audit"})).toBeVisible();
});
test("Small screen keeps essential navigation operable",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/?preview=1");
 await expect(page.locator(".tp-topbar")).toBeVisible();
 await expect(page.locator(".tp-gateway-menu")).toBeVisible();
 await page.getByRole("button",{name:"F9: Tasks"}).click();
 await expect(page.locator(".tp-task-sheet .tp-panel-title")).toHaveText("Task Allocation");
});
