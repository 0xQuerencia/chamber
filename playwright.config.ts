import {defineConfig,devices} from "@playwright/test";

export default defineConfig({
 testDir:"./tests/browser",
 fullyParallel:false,
 workers:1,
 retries:0,
 timeout:45000,
 expect:{timeout:10000},
 use:{
  baseURL:"http://127.0.0.1:8787",
  trace:"retain-on-failure",
  screenshot:"only-on-failure",
  ...devices["Desktop Chrome"]
 },
 projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}}],
 reporter:[["list"],["html",{open:"never"}]],
 webServer:{
  command:"npx wrangler dev --ip 127.0.0.1 --port 8787",
  url:"http://127.0.0.1:8787/api/health",
  reuseExistingServer:false,
  timeout:120000
 }
});
