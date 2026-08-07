(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function ensureStyles(){
  if($('#pdfPreviewZoomStyles'))return;
  const style=document.createElement('style');
  style.id='pdfPreviewZoomStyles';
  style.textContent=`
    .boundary-preview-card{overflow:visible!important;position:relative}
    .pdf-preview-toolbar{display:flex;gap:5px;justify-content:center;align-items:center;flex-wrap:wrap;margin:0 0 7px}
    .pdf-preview-toolbar button{padding:6px 9px;border:1px solid var(--l);background:#f7f9fc;color:var(--t);border-radius:8px;font-size:12px;min-width:38px}
    .pdf-preview-toolbar button:hover{border-color:var(--b);color:var(--b)}
    .pdf-preview-zoom-label{font-size:11px;font-weight:800;min-width:44px;color:var(--b)}
    .pdf-preview-viewport{overflow:auto;max-height:62vh;border-radius:9px;background:#eef1f6;padding:5px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    .pdf-preview-viewport canvas{max-width:none!important;transform-origin:top center;touch-action:pan-x pan-y}
    .boundary-preview-card.pdf-preview-expanded{position:fixed;inset:10px;z-index:10050;background:#fff;padding:12px;border-radius:16px;box-shadow:0 20px 70px #0007;display:flex;flex-direction:column}
    .boundary-preview-card.pdf-preview-expanded .pdf-preview-viewport{max-height:none;flex:1;min-height:0}
    .boundary-preview-card.pdf-preview-expanded figcaption{font-size:15px}
    body.pdf-preview-modal-open{overflow:hidden}
    @media(max-width:620px){
      .pdf-preview-toolbar{gap:4px}.pdf-preview-toolbar button{padding:6px 8px;min-width:34px}
      .pdf-preview-viewport{max-height:52vh;padding:3px}
      .boundary-preview-card.pdf-preview-expanded{inset:4px;padding:8px;border-radius:12px}
    }
  `;
  document.head.appendChild(style);
}

function currentZoom(card){
  return clamp(Number(card.dataset.previewZoom)||1,0.4,3.5);
}

function updateLabel(card){
  const label=card.querySelector('.pdf-preview-zoom-label');
  if(label)label.textContent=`${Math.round(currentZoom(card)*100)}%`;
}

function applyZoom(card,{captureBase=false}={}){
  const canvas=card.querySelector('canvas[data-boundary-canvas]');
  if(!canvas)return;
  if(captureBase||!Number(canvas.dataset.previewBaseWidth)){
    const styled=parseFloat(canvas.style.width)||canvas.getBoundingClientRect().width||220;
    if(styled>0)canvas.dataset.previewBaseWidth=String(styled/currentZoom(card));
  }
  const base=Number(canvas.dataset.previewBaseWidth)||220;
  const zoom=currentZoom(card);
  canvas.style.width=`${Math.max(80,base*zoom)}px`;
  canvas.style.height='auto';
  updateLabel(card);
}

function setZoom(card,value){
  card.dataset.previewZoom=String(clamp(value,0.4,3.5));
  applyZoom(card);
}

function fitPreview(card){
  card.dataset.previewZoom='1';
  const canvas=card.querySelector('canvas[data-boundary-canvas]');
  if(canvas){
    const viewport=card.querySelector('.pdf-preview-viewport');
    const fitWidth=Math.max(120,(viewport?.clientWidth||card.clientWidth||260)-12);
    canvas.dataset.previewBaseWidth=String(fitWidth);
  }
  applyZoom(card);
  const viewport=card.querySelector('.pdf-preview-viewport');
  if(viewport){viewport.scrollTop=0;viewport.scrollLeft=0}
}

function toggleExpanded(card){
  const expanded=!card.classList.contains('pdf-preview-expanded');
  document.querySelectorAll('.boundary-preview-card.pdf-preview-expanded').forEach(other=>{
    if(other!==card)other.classList.remove('pdf-preview-expanded');
  });
  card.classList.toggle('pdf-preview-expanded',expanded);
  document.body.classList.toggle('pdf-preview-modal-open',expanded);
  const button=card.querySelector('[data-preview-action="expand"]');
  if(button)button.textContent=expanded?'✕ إغلاق':'⛶ تكبير';
  requestAnimationFrame(()=>fitPreview(card));
}

function enhanceCard(card){
  if(card.dataset.previewZoomReady)return;
  const canvas=card.querySelector('canvas[data-boundary-canvas]');
  if(!canvas)return;
  card.dataset.previewZoomReady='1';
  card.dataset.previewZoom='1';

  const toolbar=document.createElement('div');
  toolbar.className='pdf-preview-toolbar';
  toolbar.innerHTML=`
    <button type="button" data-preview-action="minus" title="تصغير">−</button>
    <span class="pdf-preview-zoom-label">100%</span>
    <button type="button" data-preview-action="plus" title="تكبير">＋</button>
    <button type="button" data-preview-action="fit">ملاءمة</button>
    <button type="button" data-preview-action="expand">⛶ تكبير</button>`;

  const viewport=document.createElement('div');
  viewport.className='pdf-preview-viewport';
  canvas.parentNode.insertBefore(toolbar,canvas);
  canvas.parentNode.insertBefore(viewport,canvas);
  viewport.appendChild(canvas);

  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-preview-action]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    const action=button.dataset.previewAction;
    if(action==='minus')setZoom(card,currentZoom(card)-0.2);
    else if(action==='plus')setZoom(card,currentZoom(card)+0.2);
    else if(action==='fit')fitPreview(card);
    else if(action==='expand')toggleExpanded(card);
  });

  const renderObserver=new MutationObserver(mutations=>{
    if(!mutations.some(m=>m.attributeName==='width'||m.attributeName==='height'))return;
    requestAnimationFrame(()=>{
      const renderedWidth=parseFloat(canvas.style.width)||canvas.getBoundingClientRect().width;
      if(renderedWidth>0)canvas.dataset.previewBaseWidth=String(renderedWidth/currentZoom(card));
      applyZoom(card);
    });
  });
  renderObserver.observe(canvas,{attributes:true,attributeFilter:['width','height']});

  requestAnimationFrame(()=>fitPreview(card));
}

function enhanceAll(){
  ensureStyles();
  document.querySelectorAll('.boundary-preview-card').forEach(enhanceCard);
}

function init(){
  ensureStyles();
  const observer=new MutationObserver(()=>requestAnimationFrame(enhanceAll));
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const expanded=document.querySelector('.boundary-preview-card.pdf-preview-expanded');
    if(expanded)toggleExpanded(expanded);
  });
  enhanceAll();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
