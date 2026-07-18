const CACHE='explapp-pdf-studio-v14';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./book-fix.js','./modules/pdf-excel-core.js','./ui/excel-preview.js','./modules/pdf-word-docx.js','./modules/images-to-pdf.js','./modules/pdf-to-html.js','./excel-tool.js'];

function patchHtml(html){
 let patched=html;
 if(!patched.includes('book-fix.js'))patched=patched.replace('</body>','<script src="./book-fix.js"></script></body>');
 if(!patched.includes('modules/pdf-excel-core.js'))patched=patched.replace('</body>','<script src="./modules/pdf-excel-core.js"></script></body>');
 if(!patched.includes('ui/excel-preview.js'))patched=patched.replace('</body>','<script src="./ui/excel-preview.js"></script></body>');
 if(!patched.includes('modules/pdf-word-docx.js'))patched=patched.replace('</body>','<script src="./modules/pdf-word-docx.js"></script></body>');
 if(!patched.includes('modules/images-to-pdf.js'))patched=patched.replace('</body>','<script src="./modules/images-to-pdf.js"></script></body>');
 if(!patched.includes('modules/pdf-to-html.js'))patched=patched.replace('</body>','<script src="./modules/pdf-to-html.js"></script></body>');
 if(!patched.includes('excel-tool.js'))patched=patched.replace('</body>','<script src="./excel-tool.js"></script></body>');
 return patched;
}

self.addEventListener('install',event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(async response=>{
   const html=patchHtml(await response.text());
   return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }).catch(async()=>{
   const cached=await caches.match('./index.html');
   if(!cached)return Response.error();
   return new Response(patchHtml(await cached.text()),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }));
  return;
 }
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
  if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
  return response;
 })));
});