const CACHE='explapp-pdf-studio-v5';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./book-fix.js','./excel-tool.js'];

function patchHtml(html){
 let patched=html;
 if(!patched.includes('book-fix.js'))patched=patched.replace('</body>','<script src="./book-fix.js"></script></body>');
 if(!patched.includes('excel-tool.js'))patched=patched.replace('</body>','<script src="./excel-tool.js"></script></body>');
 return patched;
}

self.addEventListener('install',e=>e.waitUntil(
 caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(async res=>{
   const html=patchHtml(await res.text());
   return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }).catch(async()=>{
   const cached=await caches.match('./index.html');
   if(!cached)return Response.error();
   return new Response(patchHtml(await cached.text()),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }));
  return;
 }
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
  if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
  return res;
 })));
});
