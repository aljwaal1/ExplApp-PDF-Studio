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
document.addEventListener('click',async event=>{
 const anchor=event.target?.closest?.('a[download]');
 if(!anchor||!anchor.href.startsWith('blob:')||busy)return;
 // Very large files remain on browser fallback to avoid excessive RAM usage.
 const response=await fetch(anchor.href).catch(()=>null);
 if(!response?.ok)return;
 const blob=await response.blob();
 if(blob.size>35*1024*1024)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 busy=true;
 const name=(anchor.download||'document.pdf').replace(/[\\/:*?"<>|]/g,'_');
 try{
  show('تجهيز الملف للحفظ أو المشاركة في Android…');
  const data=await toBase64(blob);
  const path='pdf-studio/'+Date.now()+'-'+name;
  await fs.writeFile({path,data,directory:'CACHE',recursive:true});
  const uri=await fs.getUri({path,directory:'CACHE'});
  await share.share({title:name,url:uri.uri,dialogTitle:'حفظ أو مشاركة '+name});
  show('اختر تطبيق الملفات أو وجهة المشاركة لحفظ الناتج');
 }catch(error){
  console.error('Android native save failed',error);
  show('تعذر فتح نافذة الحفظ؛ استخدم طريقة التنزيل البديلة.');
  // Trigger original download through a detached link, without intercepting repeatedly.
  const fallback=document.createElement('a');
  fallback.href=anchor.href;
  fallback.download=name;
  document.body.appendChild(fallback);
  fallback.click();
  fallback.remove();
 }finally{busy=false;}
},true);
})();
