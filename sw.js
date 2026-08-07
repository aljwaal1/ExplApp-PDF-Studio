const CACHE='explapp-pdf-studio-v39';
const MODULE_SCRIPTS=[
 './core/pdf-studio-utils.js',
 './modules/pdf-excel-core.js',
 './modules/pdf-excel-dates.js',
 './modules/pdf-excel-identifiers.js',
 './ui/excel-preview.js',
 './modules/pdf-word-docx.js',
 './modules/images-to-pdf.js',
 './modules/pdf-to-html.js',
 './modules/pdf-markdown.js',
 './modules/pdf-search-advanced.js',
 './modules/pdf-ocr-advanced.js',
 './modules/pdf-tables-advanced.js',
 './modules/pdf-chapter-detection-enhanced.js',
 './modules/pdf-book-structure.js',
 './modules/pdf-boundary-previews.js',
 './modules/pdf-preview-zoom.js',
 './modules/ui-tools-refresh.js',
 './modules/pdf-watermark-numbering.js',
 './modules/pdf-session-persistence.js',
 './modules/ui-app-install.js',
 './modules/ui-ios-compat.js',
 './modules/pdf-existing-tools-enhanced.js',
 './excel-tool.js'
];
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg',...MODULE_SCRIPTS];
const CRITICAL_VENDOR=[
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
];

function scriptTag(path){
 return `<script src="${path}"></script>`;
}

function closingBodyIndex(html){
 const expression=/<\/body\s*>/gi;
 let match;
 let last=-1;
 while((match=expression.exec(html)))last=match.index;
 return last;
}

function patchHtml(html){
 const tags=MODULE_SCRIPTS
  .filter(path=>!html.includes(path.replace(/^\.\//,'')))
  .map(scriptTag)
  .join('');
 if(!tags)return html;
 const index=closingBodyIndex(html);
 if(index<0)return `${html}${tags}`;
 return `${html.slice(0,index)}${tags}${html.slice(index)}`;
}

async function cacheCriticalVendor(cache){
 await Promise.allSettled(CRITICAL_VENDOR.map(async url=>{
  try{
   const response=await fetch(url,{mode:'cors',cache:'reload'});
   if(response?.ok)await cache.put(url,response.clone());
  }catch{}
 }));
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(CORE);
 await cacheCriticalVendor(cache);
 await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(key=>key!==CACHE).map(key=>caches.delete(key)));
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 await self.clients.claim();
 await Promise.all(windows.map(async client=>{
  try{
   const url=new URL(client.url);
   if(url.searchParams.get('pwa')===CACHE)return;
   url.searchParams.set('pwa',CACHE);
   await client.navigate(url.href);
  }catch{}
 }));
})()));

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
