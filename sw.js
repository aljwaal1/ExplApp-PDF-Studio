const CACHE='explapp-pdf-studio-v4';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./book-fix.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(async res=>{
   const html=await res.text();
   const patched=html.includes('book-fix.js')?html:html.replace('</body>','<script src="./book-fix.js"></script></body>');
   return new Response(patched,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }).catch(async()=>{
   const cached=await caches.match('./index.html');
   if(!cached)return Response.error();
   const html=await cached.text();
   const patched=html.includes('book-fix.js')?html:html.replace('</body>','<script src="./book-fix.js"></script></body>');
   return new Response(patched,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }));
  return;
 }
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
  if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
  return res;
 })));
});