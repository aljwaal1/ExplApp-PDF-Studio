const CACHE='explapp-pdf-studio-v30';
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
 './modules/pdf-book-structure.js',
 './modules/pdf-existing-tools-enhanced.js',
 './excel-tool.js'
];
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg',...MODULE_SCRIPTS];

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

self.addEventListener('install',event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));

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
