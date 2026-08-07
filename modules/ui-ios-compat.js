(()=>{
'use strict';

const $=s=>document.querySelector(s);
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent||'')||(/Macintosh/.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||window.navigator.standalone===true;

function ensureStyles(){
  if($('#iosCompatStyles'))return;
  const style=document.createElement('style');
  style.id='iosCompatStyles';
  style.textContent=`
    #files.ios-file-input{
      display:block!important;position:absolute!important;width:1px!important;height:1px!important;
      opacity:.001!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;
      pointer-events:none!important;left:-9999px!important;top:auto!important;
    }
    .ios-file-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px}
    .ios-file-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:10px 15px;border-radius:11px;background:var(--b);color:#fff;border:0;font-weight:800;-webkit-appearance:none;appearance:none;touch-action:manipulation}
    .ios-file-note{margin-top:7px;font-size:11px;color:var(--m);text-align:center;line-height:1.6}
    .ios-runtime-warning{margin:10px 0;padding:10px 12px;border:1px solid #f3c97a;border-radius:12px;background:#fff8e8;color:#7a5200;font-size:12px;line-height:1.7}
    .ios-runtime-warning button{margin-top:8px;min-height:42px}
    button,.tool,.drop{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    @media(max-width:620px){.ios-file-button{width:100%}.ios-file-actions{display:block}}
  `;
  document.head.appendChild(style);
}

function ensurePickerButton(){
  const input=$('#files'),drop=$('#drop');
  if(!input||!drop)return;
  input.classList.add('ios-file-input');
  input.setAttribute('accept','.pdf,application/pdf');
  if($('#iosFilePickerButton'))return;
  const actions=document.createElement('div');
  actions.className='ios-file-actions';
  actions.innerHTML=`<button type="button" id="iosFilePickerButton" class="ios-file-button">📁 اختيار PDF من الملفات</button>`;
  drop.appendChild(actions);
  const note=document.createElement('div');
  note.className='ios-file-note';
  note.textContent=isIOS()?'على iPhone سيتم فتح تطبيق «الملفات» لاختيار PDF.':'يمكنك اختيار ملف PDF مباشرة من جهازك.';
  drop.appendChild(note);
  $('#iosFilePickerButton')?.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    try{input.click()}catch(error){console.error('file picker failed',error)}
  });
  $('#iosFilePickerButton')?.addEventListener('touchend',event=>{
    if(event.cancelable)event.preventDefault();
    try{input.click()}catch(error){console.error('file picker touch failed',error)}
  },{passive:false});
}

function showRuntimeWarning(message){
  if($('#iosRuntimeWarning'))return;
  const panel=document.querySelector('.panel');
  if(!panel)return;
  const box=document.createElement('div');
  box.id='iosRuntimeWarning';
  box.className='ios-runtime-warning';
  box.innerHTML=`<b>تعذر تجهيز محرك PDF بالكامل.</b><br>${message}<br><button type="button" class="primary" id="iosReloadApp">إعادة تحميل التطبيق</button>`;
  panel.insertAdjacentElement('afterbegin',box);
  $('#iosReloadApp')?.addEventListener('click',()=>location.reload());
}

function checkRuntime(){
  const missing=[];
  if(!window.pdfjsLib)missing.push('PDF.js');
  if(!window.PDFLib)missing.push('PDF-Lib');
  if(missing.length){
    showRuntimeWarning(`المكتبات غير الجاهزة: ${missing.join('، ')}. تأكد من الاتصال بالإنترنت ثم أعد التحميل.`);
    return false;
  }
  return true;
}

function hardenClicks(){
  document.addEventListener('touchstart',event=>{
    const target=event.target.closest('button,.tool,.drop,input,select');
    if(target)target.classList.add('ios-touching');
  },{passive:true});
  document.addEventListener('touchend',event=>{
    const target=event.target.closest('button,.tool,.drop,input,select');
    if(target)setTimeout(()=>target.classList.remove('ios-touching'),80);
  },{passive:true});
}

function markEnvironment(){
  document.documentElement.dataset.ios=isIOS()?'1':'0';
  document.documentElement.dataset.standalone=isStandalone()?'1':'0';
}

function init(){
  ensureStyles();
  markEnvironment();
  ensurePickerButton();
  hardenClicks();
  setTimeout(checkRuntime,700);
  const observer=new MutationObserver(()=>ensurePickerButton());
  observer.observe(document.body,{childList:true,subtree:true});
}

window.ExplAppIOSCompat=Object.freeze({isIOS,isStandalone,checkRuntime});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
