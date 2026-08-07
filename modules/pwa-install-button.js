(()=>{
'use strict';

const $=selector=>document.querySelector(selector);

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
}

function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent)||(/macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
}

function ensureStyles(){
  if($('#pwaInstallButtonStyles'))return;
  const style=document.createElement('style');
  style.id='pwaInstallButtonStyles';
  style.textContent=`
    #install.install{display:inline-flex!important;align-items:center;justify-content:center;gap:7px;background:linear-gradient(135deg,#2859d8,#5579e7);color:#fff;border:1px solid #ffffff55;box-shadow:0 7px 18px #2859d836;padding:9px 13px;border-radius:12px;white-space:nowrap}
    #install.install:hover{transform:translateY(-1px);box-shadow:0 10px 24px #2859d848}
    #install.install:disabled{opacity:.72;cursor:default;transform:none;box-shadow:none}
    .pwa-install-backdrop{position:fixed;inset:0;z-index:20000;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px}
    .pwa-install-card{width:min(520px,100%);background:#fff;border-radius:20px;padding:20px;box-shadow:0 24px 80px #0006;text-align:right;direction:rtl}
    .pwa-install-card h3{margin:0 0 10px;color:var(--t);font-size:19px}.pwa-install-card p{color:var(--m);line-height:1.8;font-size:13px;margin:8px 0}
    .pwa-install-steps{background:#f5f8ff;border:1px solid #dbe5f8;border-radius:14px;padding:12px 14px;color:var(--t);font-size:13px;line-height:2}
    .pwa-install-actions{display:flex;gap:8px;margin-top:14px}.pwa-install-actions button{flex:1}
    @media(max-width:620px){#install.install{padding:8px 10px;font-size:12px}.pwa-install-card{padding:16px;border-radius:17px}.pwa-install-actions{display:block}.pwa-install-actions button{width:100%;margin-top:7px}}
  `;
  document.head.appendChild(style);
}

function closeGuide(){
  $('#pwaInstallGuide')?.remove();
}

function showGuide(){
  closeGuide();
  const ios=isIOS();
  const overlay=document.createElement('div');
  overlay.id='pwaInstallGuide';
  overlay.className='pwa-install-backdrop';
  overlay.innerHTML=`<div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
    <h3 id="pwaInstallTitle">⬇️ تثبيت ExplApp PDF Studio</h3>
    ${ios
      ?`<p>على iPhone وiPad يتم تثبيت التطبيق من Safari بهذه الخطوات:</p><div class="pwa-install-steps"><b>1.</b> افتح الصفحة في Safari.<br><b>2.</b> اضغط زر <b>المشاركة ⤴︎</b>.<br><b>3.</b> اختر <b>إضافة إلى الشاشة الرئيسية</b>.<br><b>4.</b> اضغط <b>إضافة</b>.</div>`
      :`<p>إذا لم تظهر نافذة التثبيت تلقائيًا، استخدم قائمة المتصفح واختر <b>تثبيت التطبيق</b> أو <b>Install app</b> / <b>Add to Home screen</b>.</p><div class="pwa-install-steps">في Chrome وEdge ستجد خيار التثبيت غالبًا بجانب شريط العنوان أو داخل قائمة ⋮.</div>`}
    <div class="pwa-install-actions"><button type="button" class="primary" data-pwa-close>فهمت</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-pwa-close]'))closeGuide()});
}

function setupButton(){
  ensureStyles();
  const button=$('#install');
  if(!button)return;
  button.classList.add('install');
  button.style.display='inline-flex';
  button.title='تثبيت ExplApp PDF Studio على الجهاز';

  if(isStandalone()){
    button.textContent='✓ التطبيق مثبت';
    button.disabled=true;
    return;
  }

  button.disabled=false;
  button.textContent='⬇️ تحميل / تثبيت التطبيق';
  if(button.dataset.installGuideBound)return;
  button.dataset.installGuideBound='1';
  button.addEventListener('click',()=>{
    setTimeout(()=>{
      if(!isStandalone())showGuide();
    },350);
  });
}

function init(){
  setupButton();
  window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',setupButton);
  window.addEventListener('appinstalled',setupButton);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
