// Bump CACHE whenever any file below changes so phones pick up the new version.
const CACHE='love-station-v11-likes';
const FONTS='love-station-fonts';
const SHELL=['./','index.html','style.css','atelier.css','assets/coupon-reference.png','app.js','config.js','vendor/supabase.js','manifest.webmanifest','assets/dessert.webp','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png','assets/apple-touch-icon.png'];

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
  // App shell: network first so updates show up right away; fall back to cache when offline.
  e.respondWith(caches.open(CACHE).then(c=>fetch(req).then(res=>{if(res.ok)c.put(req,res.clone());return res}).catch(async()=>await c.match(req,{ignoreSearch:true})||(req.mode==='navigate'&&await c.match('index.html'))||Response.error())));
});

// 手機推播：通知只寫「有新的小驚喜」，點了打開補給站。
self.addEventListener('push',e=>{
  let d={};try{d=e.data?.json()||{}}catch{}
  e.waitUntil(self.registration.showNotification(d.title||'寶貝的戀愛補給站',{body:d.body||'有新的小驚喜在等你 ♡',icon:'assets/icon-192.png',badge:'assets/icon-192.png',tag:'love-station',renotify:true,data:{url:d.url||'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const open=list.find(c=>c.url.startsWith(self.registration.scope));
    return open?open.focus():self.clients.openWindow(e.notification.data?.url||'./');
  }));
});
