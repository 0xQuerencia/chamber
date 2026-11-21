// Cache only static files; never cache authenticated client data or API results.
const CACHE="chamber-static-v1";
const CORE=["/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("chamber-static-")&&k!==CACHE).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/")||req.mode==="navigate")return;
 if(!(url.pathname.startsWith("/assets/")||CORE.includes(url.pathname)))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(req);
  if(cached)return cached;
  const response=await fetch(req);
  if(response.ok)await cache.put(req,response.clone());
  return response;
 }));
});
