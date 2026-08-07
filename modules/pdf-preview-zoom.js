(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const MIN_ZOOM=.5,MAX_ZOOM=4,STEP=.25;

function ensureStyles(){
  if($('#pdfPreviewZoomStyles'))return;
  const style=document.createElement('style');
  style.id='pdfPreviewZoomStyles';
  style.textContent=`
    .boundary-preview-card{overflow:visible!important;position:relative}
    .pdf-preview-toolbar{position:relative;z-index:2;display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;margin:0 0 8px;padding:7px;border:1px solid #dce5f2;border-radius:11px;background:#f7f9fd}
    .pdf-preview-toolbar button{padding:7px 10px!important;border:1px solid #cfd9e8!important;background:#fff!important;color:var(--t)!important;border-radius:9px!important;font-size:12px!important;min-width:40px!important;box-shadow:none!important;transform:none!important}
    .pdf-preview-toolbar button:hover{border-color:var(--b)!important;color:var(--b)!important}.pdf-preview-toolbar button:active{transform:scale(.96)!important}
    .pdf-preview-toolbar input[type=range]{width:120px;accent-color:var(--b)}
    .pdf-preview-zoom-label{font-size:12px;font-weight:900;min-width:48px;color:var(--b);direction:ltr}
    .pdf-preview-viewport{overflow:auto;max-height:68vh;border:1px solid #dfe6f0;border-radius:10px;background:#e9edf4;padding:7px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;text-align:center}
    .pdf-preview-viewport canvas{display:block!important;max-width:none!important;margin:0 auto!important;transform-origin:top center;touch-action:pan-x pan-y;cursor:zoom-in;box-shadow:0 7px 24px #17203320}
    .boundary-preview-card.pdf-preview-expanded{position:fixed!important;inset:8px!important;z-index:10050!important;background:#fff!important;padding:12px!important;border-radius:18px!important;box-shadow:0 24px 80px #0008!important;display:flex!important;flex-direction:column!important;margin:0!important}
    .boundary-preview-card.pdf-preview-expanded .pdf-preview-toolbar{flex:0 0 auto}
    .boundary-preview-card.pdf-preview-expanded .pdf-preview-viewport{max-height:none!important;flex:1;min-height:0;padding:12px}
    .boundary-preview-card.pdf-preview-expanded figcaption{font-size:16px!important;margin-bottom:8px!important}
    .boundary-preview-card.pdf-preview-expanded .boundary-preview-status{font-size:12px}
    body.pdf-preview-modal-open{overflow:hidden!important}
    @media(max-width:760px){
      .pdf-preview-toolbar{position:sticky;top:0;gap:5px;padding:6px}.pdf-preview-toolbar input[type=range]{width:min(34vw,150px)}
      .pdf-preview-toolbar button{padding:8px 9px!important;min-width:38px!important}.pdf-preview-viewport{max-height:72vh;padding:5px}
      .boundary-preview-card.pdf-preview-expanded{inset:3px!important;padding:7px!important;border-radius:12px!important}
      .boundary-preview-card.pdf-preview-expanded .pdf-preview-viewport{padding:5px}
    }
  `;
  document.head.appendChild(style);
}

function canvasFor(card){return card.querySelector('canvas[data-boundary-canvas]')}
function viewportFor(card){return card.querySelector('.pdf-preview-viewport')}
function currentZoom(card){return clamp(Number(card.dataset.previewZoom)||1,MIN_ZOOM,MAX_ZOOM)}
function naturalWidth(canvas){return Math.max(80,Number(canvas?.dataset.previewNaturalWidth)||parseFloat(canvas?.style.width)||canvas?.getBoundingClientRect().width||300)}

function syncControls(card){
  const zoom=currentZoom(card),label=card.querySelector('.pdf-preview-zoom-label'),slider=card.querySelector('[data-preview-slider]');
  if(label)label.textContent=`${Math.round(zoom*100)}%`;
  if(slider)slider.value=String(Math.round(zoom*100));
}

function applyZoom(card,{center=false}={}){
  const canvas=canvasFor(card);if(!canvas)return;
  const zoom=currentZoom(card),base=naturalWidth(canvas);
  canvas.style.width=`${Math.round(base*zoom)}px`;
  canvas.style.height='auto';
  syncControls(card);
  if(center){
    const viewport=viewportFor(card);
    if(viewport){viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2)}
  }
}

function setZoom(card,value,options={}){
  card.dataset.previewZoom=String(clamp(value,MIN_ZOOM,MAX_ZOOM));
  applyZoom(card,options);
}

function fitPreview(card){
  const canvas=canvasFor(card),viewport=viewportFor(card);if(!canvas||!viewport)return;
  const base=naturalWidth(canvas);
  const available=Math.max(100,viewport.clientWidth-18);
  setZoom(card,clamp(available/base,MIN_ZOOM,MAX_ZOOM));
  viewport.scrollTop=0;viewport.scrollLeft=0;
}

function toggleExpanded(card){
  const expanded=!card.classList.contains('pdf-preview-expanded');
  document.querySelectorAll('.boundary-preview-card.pdf-preview-expanded').forEach(other=>{if(other!==card)other.classList.remove('pdf-preview-expanded')});
  card.classList.toggle('pdf-preview-expanded',expanded);
  document.body.classList.toggle('pdf-preview-modal-open',expanded);
  const button=card.querySelector('[data-preview-action="expand"]');
  if(button)button.textContent=expanded?'✕ إغلاق':'⛶ ملء الشاشة';
  requestAnimationFrame(()=>{
    if(expanded)fitPreview(card);else setZoom(card,1);
  });
}

function bindPinch(card){
  const viewport=viewportFor(card);if(!viewport||viewport.dataset.pinchBound)return;
  viewport.dataset.pinchBound='1';
  let startDistance=0,startZoom=1,lastTap=0;
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  viewport.addEventListener('touchstart',event=>{
    if(event.touches.length===2){startDistance=distance(event.touches);startZoom=currentZoom(card)}
    if(event.touches.length===1){
      const now=Date.now();
      if(now-lastTap<280){event.preventDefault();setZoom(card,currentZoom(card)>1.55?1:2,{center:true})}
      lastTap=now;
    }
  },{passive:false});
  viewport.addEventListener('touchmove',event=>{
    if(event.touches.length!==2||!startDistance)return;
    event.preventDefault();
    setZoom(card,startZoom*(distance(event.touches)/startDistance),{center:true});
  },{passive:false});
  viewport.addEventListener('touchend',()=>{startDistance=0},{passive:true});
}

function enhanceCard(card){
  if(card.dataset.previewZoomReady)return;
  const canvas=canvasFor(card);if(!canvas)return;
  card.dataset.previewZoomReady='1';card.dataset.previewZoom='1';

  const toolbar=document.createElement('div');
  toolbar.className='pdf-preview-toolbar';
  toolbar.innerHTML=`
    <button type="button" data-preview-action="minus" title="تصغير المعاينة">−</button>
    <span class="pdf-preview-zoom-label">100%</span>
    <button type="button" data-preview-action="plus" title="تكبير المعاينة">＋</button>
    <input data-preview-slider type="range" min="50" max="400" step="10" value="100" aria-label="حجم المعاينة">
    <button type="button" data-preview-action="fit">↔ ملاءمة</button>
    <button type="button" data-preview-action="expand">⛶ ملء الشاشة</button>`;

  const viewport=document.createElement('div');
  viewport.className='pdf-preview-viewport';
  canvas.parentNode.insertBefore(toolbar,canvas);
  canvas.parentNode.insertBefore(viewport,canvas);
  viewport.appendChild(canvas);

  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-preview-action]');if(!button)return;
    event.preventDefault();event.stopPropagation();
    const action=button.dataset.previewAction;
    if(action==='minus')setZoom(card,currentZoom(card)-STEP,{center:true});
    else if(action==='plus')setZoom(card,currentZoom(card)+STEP,{center:true});
    else if(action==='fit')fitPreview(card);
    else if(action==='expand')toggleExpanded(card);
  });
  toolbar.querySelector('[data-preview-slider]')?.addEventListener('input',event=>setZoom(card,Number(event.target.value)/100,{center:true}));
  canvas.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleExpanded(card)});
  canvas.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();setZoom(card,currentZoom(card)>1.55?1:2,{center:true})});
  canvas.addEventListener('explapp-preview-rendered',()=>requestAnimationFrame(()=>{
    setZoom(card,card.classList.contains('pdf-preview-expanded')?currentZoom(card):1);
  }));
  bindPinch(card);
  requestAnimationFrame(()=>fitPreview(card));
}

function enhanceAll(){ensureStyles();document.querySelectorAll('.boundary-preview-card').forEach(enhanceCard)}

function init(){
  ensureStyles();
  new MutationObserver(()=>requestAnimationFrame(enhanceAll)).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const expanded=document.querySelector('.boundary-preview-card.pdf-preview-expanded');if(expanded)toggleExpanded(expanded)}});
  addEventListener('resize',()=>setTimeout(()=>document.querySelectorAll('.boundary-preview-card:not(.pdf-preview-expanded)').forEach(fitPreview),120));
  enhanceAll();
}

window.ExplAppPreviewZoom=Object.freeze({enhanceAll,setZoom,fitPreview});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
