(()=>{
'use strict';
// Capture dynamically created blob download anchors and offer Android's native Save/Share sheet.
// The web and Windows versions are unaffected.
if(!window.Capacitor?.isNativePlatform?.())return;
const fs=window.Capacitor.Plugins?.Filesystem;
const share=window.Capacitor.Plugins?.Share;
if(!fs||!share){console.warn('Android save plugins unavailable; using browser download fallback');return;}
let busy=false;
const show=msg=>{const n=document.querySelector('#msg');if(n)n.textContent=msg;};
const toBase64=async blob=>{
 const buf=await blob.arrayBuffer(),bytes=new Uint8Array(buf);
 const parts=[],size=0x8000;
 for(let i=0;i<bytes.length;i+=size)parts.push(String.fromCharCode(...bytes.subarray(i,i+size)));
 return btoa(parts.join(''));
};
const bypass=new WeakSet();
document.addEventListener('click',event=>{
 const anchor=event.target?.closest?.('a[download]');
 if(!anchor||!anchor.href.startsWith('blob:')||busy||bypass.has(anchor))return;
 // Cancel immediately; awaiting first would let WebView start the unreliable browser download.
 event.preventDefault();
 event.stopImmediatePropagation();
 const fallback=()=>{
   bypass.add(anchor);
   anchor.click();
   bypass.delete(anchor);
 };
 busy=true;
 (async()=>{
  const response=await fetch(anchor.href);
  if(!response.ok)throw Error('Unable to read generated file');
  const blob=await response.blob();
  if(blob.size>35*1024*1024){fallback();return;}
  const name=(anchor.download||'document.pdf').replace(/[\\\\/:*?"<>|]/g,'_');
  show('تجهيز الملف للحفظ أو المشاركة في Android…');
  const data=await toBase64(blob);
  const path='pdf-studio/'+Date.now()+'-'+name;
  await fs.writeFile({path,data,directory:'CACHE',recursive:true});
  const uri=await fs.getUri({path,directory:'CACHE'});
  await share.share({title:name,url:uri.uri,dialogTitle:'حفظ أو مشاركة '+name});
  show('اختر تطبيق الملفات أو وجهة المشاركة لحفظ الناتج');
 })().catch(error=>{
  console.error('Android native save failed',error);
  show('تعذر فتح نافذة الحفظ؛ جاري محاولة التنزيل البديل.');
  fallback();
 }).finally(()=>{busy=false;});
},true);
})();
