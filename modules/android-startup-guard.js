(()=>{
'use strict';
const failures=[];
function report(message){
 failures.push(String(message||'خطأ غير معروف').slice(0,250));
 const banner=document.getElementById('androidBootStatus');
 if(!banner)return;
 banner.style.display='block';
 banner.style.background='#fff5ed';
 banner.style.color='#8a290b';
 banner.textContent='تعذر تشغيل بعض مكونات التطبيق: '+failures.slice(-2).join(' | ')+' — أرسل صورة هذه الرسالة للمطور.';
}
window.addEventListener('error',event=>{
 if(event.target?.tagName==='SCRIPT'){
   report('ملف مفقود: '+(event.target.src||'script'));
 }else{
   report(event.message||'JavaScript runtime error');
 }
},true);
window.addEventListener('unhandledrejection',event=>report(event.reason?.message||String(event.reason)));
function check(){
 const banner=document.getElementById('androidBootStatus');
 if(!banner)return;
 const count=document.querySelectorAll('#tools .tool').length;
 const engines=Boolean(window.pdfjsLib&&window.PDFLib&&window.JSZip&&window.XLSX);
 if(count>0&&engines&&!failures.length){
   banner.remove();
   return;
 }
 if(!failures.length)report('الواجهة: '+count+' أداة، المكتبات: '+(engines?'جاهزة':'غير جاهزة'));
}
window.addEventListener('load',()=>setTimeout(check,3500),{once:true});
setTimeout(check,10000);
})();
