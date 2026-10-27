// Bump CACHE whenever any file below changes so phones pick up the new version.
const CACHE='love-station-v2';
const FONTS='love-station-fonts';
const SHELL=['./','index.html','style.css','app.js','manifest.webmanifest','assets/dessert.webp','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png','assets/apple-touch-icon.png'];

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});

self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Google Fonts: cache-first, so the handwritten look survives offline.
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(c=>c.match(req).then(hit=>hit||fetch(req).then(res=>{c.put(req,res.clone());return res}))));
    return;
  }
  if(url.origin!==location.origin)return;
  // App shell: serve from cache immediately, refresh the cache in the background.
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true})||(req.mode==='navigate'?await c.match('index.html'):undefined);
    const net=fetch(req).then(res=>{if(res.ok)c.put(req,res.clone());return res}).catch(()=>hit||Response.error());
    if(hit){e.waitUntil(net);return hit}
    return net;
  }));
});
