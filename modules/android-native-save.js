(()=>{
'use strict';
// Capacitor Android: intercept programmatic downloads, including DETACHED anchors.
// Web/PWA builds do not include this file.
if(!window.Capacitor?.isNativePlatform?.())return;
const fs=window.Capacitor.Plugins?.Filesystem;
const share=window.Capacitor.Plugins?.Share;
if(!fs||!share){console.warn('Native save plugins unavailable');return;}

const originalClick=HTMLAnchorElement.prototype.click;
let active=false;
let serial=0;
const show=msg=>{const n=document.querySelector('#msg');if(n)n.textContent=msg;};
const safeName=name=>String(name||'document.pdf').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,160);

async function encode(blob){
  // FileSystem API expects base64. Process chunks to avoid stack overflows.
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const chunks=[];
  for(let i=0;i<bytes.length;i+=16384)chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return btoa(chunks.join(''));
}
async function save(anchor){
  const response=await fetch(anchor.href);
  if(!response.ok)throw Error('Unable to read generated file');
  const blob=await response.blob();
  if(blob.size>35*1024*1024){
    show('الملف كبير؛ ستحاول النسخة تنزيله بالطريقة المعتادة.');
    originalClick.call(anchor);
    return;
  }
  const name=safeName(anchor.download);
  const path='pdf-studio/'+Date.now()+'-'+(++serial)+'-'+name;
  show('جار تجهيز الملف للحفظ على Android…');
  await fs.writeFile({path,data:await encode(blob),directory:'CACHE',recursive:true});
  const result=await fs.getUri({path,directory:'CACHE'});
  await share.share({title:name,url:result.uri,dialogTitle:'حفظ أو مشاركة '+name});
  show('تم فتح خيارات الحفظ والمشاركة.');
}
// A click listener on document cannot catch detached anchors created by
// the existing download() utility. Intercept the method itself instead.
HTMLAnchorElement.prototype.click=function(){
  if(!this.download||!String(this.href||'').startsWith('blob:'))return originalClick.call(this);
  if(active){show('انتظر انتهاء حفظ الملف الحالي.');return;}
  const anchor=this;
  active=true;
  // Some callers revoke their blob URLs after 5 seconds; start fetching immediately.
  save(anchor).catch(error=>{
    console.error('Native Android download failed',error);
    show('تعذرت مشاركة الملف؛ جار تجربة تنزيل المتصفح.');
    originalClick.call(anchor);
  }).finally(()=>{active=false;});
};
// Handle explicit user clicks on download links too.
document.addEventListener('click',event=>{
  const a=event.target?.closest?.('a[download]');
  if(!a||!String(a.href||'').startsWith('blob:'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  a.click();
},true);
})();
