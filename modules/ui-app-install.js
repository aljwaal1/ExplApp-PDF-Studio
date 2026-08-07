(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
let deferredPrompt=null;

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches===true||window.navigator.standalone===true;
}

function isIOS(){
  const ua=navigator.userAgent||'';
  return /iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
}

function isSafari(){
  const ua=navigator.userAgent||'';
  return /Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

function ensureStyles(){
  if($('#appInstallStyles'))return;
  const style=document.createElement('style');
  style.id='appInstallStyles';
  style.textContent=`
    .app-install-cta{margin-top:15px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .app-install-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:12px 18px;border:1px solid #ffffff66;border-radius:14px;background:#fff;color:#214bbd;font-weight:900;box-shadow:0 10px 28px #102d7d33;transition:.18s ease}
    .app-install-btn:hover{transform:translateY(-2px);box-shadow:0 14px 32px #102d7d44}
    .app-install-btn:active{transform:translateY(0)}
    .app-install-btn[disabled]{opacity:.78;cursor:default;transform:none}
    .app-install-hint{font-size:12px;color:#eef3ff;line-height:1.6}
    .app-install-modal{position:fixed;inset:0;z-index:12000;background:#0f172a99;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}
    .app-install-dialog{width:min(520px,100%);background:#fff;color:var(--t);border-radius:20px;padding:18px;box-shadow:0 24px 80px #0006;text-align:right}
    .app-install-dialog h3{margin:0 0 8px;font-size:19px}.app-install-dialog p{margin:0 0 12px;color:var(--m);font-size:13px;line-height:1.8}
    .app-install-steps{margin:0;padding:0 20px 0 0;line-height:2;color:var(--t);font-size:13px}
    .app-install-dialog-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
    .app-install-dialog-actions button{min-width:120px}
    .app-install-device-note{margin-top:10px;padding:9px 11px;border-radius:11px;background:#f4f7fb;color:#59667b;font-size:11px;line-height:1.7}
    @media(max-width:620px){
      .app-install-cta{display:block}.app-install-btn{width:100%;font-size:15px}.app-install-hint{display:block;margin-top:8px;text-align:center}
      .app-install-dialog{padding:16px;border-radius:16px}.app-install-dialog-actions button{flex:1}
    }
  `;
  document.head.appendChild(style);
}

function ensureButton(){
  ensureStyles();
  let wrap=$('#appInstallCta');
  if(wrap)return wrap;
  const hero=document.querySelector('.hero');
  if(!hero)return null;
  wrap=document.createElement('div');
  wrap.id='appInstallCta';
  wrap.className='app-install-cta';
  wrap.innerHTML=`<button type="button" id="appInstallMain" class="app-install-btn"><span>⬇️</span><span>تحميل / تثبيت التطبيق</span></button><span class="app-install-hint" id="appInstallHint">يعمل كتطبيق مستقل ويمكن إضافته إلى الشاشة الرئيسية.</span>`;
  hero.appendChild(wrap);
  $('#appInstallMain')?.addEventListener('click',handleInstallClick);
  return wrap;
}

function updateButton(){
  ensureButton();
  const button=$('#appInstallMain');
  const hint=$('#appInstallHint');
  if(!button)return;
  if(isStandalone()){
    button.disabled=true;
    button.innerHTML='<span>✅</span><span>التطبيق مثبت</span>';
    if(hint)hint.textContent='أنت تستخدم ExplApp PDF Studio كتطبيق مستقل.';
    return;
  }
  button.disabled=false;
  button.innerHTML='<span>⬇️</span><span>تحميل / تثبيت التطبيق</span>';
  if(hint){
    if(isIOS())hint.textContent='على iPhone وiPad: التثبيت يتم من Safari عبر «إضافة إلى الشاشة الرئيسية».';
    else if(deferredPrompt)hint.textContent='اضغط الزر لتثبيت التطبيق مباشرة على جهازك.';
    else hint.textContent='اضغط لرؤية طريقة التثبيت المناسبة لجهازك.';
  }
}

function closeModal(){
  $('#appInstallModal')?.remove();
  document.body.style.overflow='';
}

function showInstructions(){
  closeModal();
  const modal=document.createElement('div');
  modal.id='appInstallModal';
  modal.className='app-install-modal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','appInstallTitle');

  let title='تثبيت ExplApp PDF Studio';
  let intro='يمكن تثبيت الأداة كتطبيق مستقل دون متجر تطبيقات.';
  let steps=[];
  let note='بعد التثبيت ستجد التطبيق مع بقية التطبيقات، ويمكنه الاستفادة من التخزين المحلي والـPWA.';

  if(isIOS()){
    title='تثبيت التطبيق على iPhone / iPad';
    intro=isSafari()?'أنت تستخدم Safari. اتبع الخطوات التالية:':'افتح هذه الصفحة في Safari أولًا، ثم اتبع الخطوات التالية:';
    steps=['اضغط زر المشاركة ⎙ / Share أسفل Safari أو أعلى الشاشة.','اختر «إضافة إلى الشاشة الرئيسية» — Add to Home Screen.','اضغط «إضافة» — Add.'];
    note='iOS لا يعرض نافذة تثبيت PWA التلقائية مثل Chrome؛ هذه هي طريقة Apple الرسمية لإضافته كتطبيق.';
  }else{
    title='تثبيت التطبيق على الكمبيوتر / أندرويد';
    intro='يمكن تثبيته مباشرة عندما يسمح المتصفح بذلك.';
    steps=['افتح الصفحة في Chrome أو Edge.','من قائمة المتصفح اختر «تثبيت التطبيق» / Install app أو «إضافة إلى الشاشة الرئيسية».','أكد التثبيت وسيظهر ExplApp PDF Studio كتطبيق مستقل.'];
    note='إذا ظهر رمز التثبيت في شريط العنوان يمكنك الضغط عليه مباشرة.';
  }

  modal.innerHTML=`<div class="app-install-dialog"><h3 id="appInstallTitle">${title}</h3><p>${intro}</p><ol class="app-install-steps">${steps.map(step=>`<li>${step}</li>`).join('')}</ol><div class="app-install-device-note">${note}</div><div class="app-install-dialog-actions"><button type="button" class="primary" id="appInstallClose">فهمت</button></div></div>`;
  document.body.appendChild(modal);
  document.body.style.overflow='hidden';
  $('#appInstallClose')?.addEventListener('click',closeModal);
  modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
}

async function handleInstallClick(){
  if(isStandalone())return;
  if(deferredPrompt){
    try{
      deferredPrompt.prompt();
      const choice=await deferredPrompt.userChoice;
      if(choice?.outcome==='accepted')deferredPrompt=null;
      updateButton();
      return;
    }catch{}
  }
  showInstructions();
}

function init(){
  ensureButton();
  updateButton();
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    updateButton();
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    updateButton();
  });
  window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',updateButton);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal()});
}

window.ExplAppInstall=Object.freeze({showInstructions,updateButton});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
