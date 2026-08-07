(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;
let cachedPdf=null;
let cachedSignature='';
let loadPromise=null;

function ensureStyles(){
  if($('#boundaryPreviewStyles'))return;
  const style=document.createElement('style');
  style.id='boundaryPreviewStyles';
  style.textContent=`
    .boundary-range-title{margin-top:10px;padding:10px 12px;border-radius:11px;background:#eef3ff;color:var(--b);font-weight:800;text-align:center}
    .boundary-preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .boundary-preview-card{margin:0;border:1px solid var(--l);border-radius:12px;background:#fff;padding:8px;text-align:center;overflow:hidden}
    .boundary-preview-card figcaption{font-size:12px;font-weight:800;margin-bottom:7px;color:var(--t)}
    .boundary-preview-card canvas{display:block;max-width:100%;height:auto;margin:auto;border:1px solid #e5e9f0;border-radius:8px;background:#f7f8fb}
    .boundary-preview-status{font-size:11px;color:var(--m);margin-top:6px;min-height:16px}
    .split-boundary-box{margin-top:12px;border:1px solid var(--l);border-radius:14px;padding:11px;background:#fbfcff}
    .split-boundary-note{font-size:11px;color:var(--m);text-align:center;margin-top:7px}
    @media(max-width:620px){.boundary-preview-grid{grid-template-columns:1fr 1fr;gap:7px}.boundary-preview-card{padding:6px}.boundary-preview-card figcaption{font-size:11px}}
  `;
  document.head.appendChild(style);
}

function selectedPdfFile(){
  return [...($('#files')?.files||[])].find(file=>/\.pdf$/i.test(file.name))||null;
}

function signature(file){
  return file?`${file.name}|${file.size}|${file.lastModified}`:'';
}

async function getPdf(){
  const file=selectedPdfFile();
  if(!file)return null;
  const sig=signature(file);
  if(cachedPdf&&cachedSignature===sig)return cachedPdf;
  if(loadPromise&&cachedSignature===sig)return loadPromise;
  cachedSignature=sig;
  loadPromise=(async()=>{
    const bytes=await file.arrayBuffer();
    const doc=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
    cachedPdf=doc;
    return doc;
  })();
  try{return await loadPromise}finally{loadPromise=null}
}

function clearPdfCache(){
  cachedPdf=null;
  cachedSignature='';
  loadPromise=null;
}

async function renderThumb(pdf,pageNo,canvas,status){
  const token=String((Number(canvas.dataset.renderToken)||0)+1);
  canvas.dataset.renderToken=token;
  if(status)status.textContent='جاري تحميل المعاينة…';
  const safePage=Math.max(1,Math.min(pdf.numPages,Math.round(Number(pageNo)||1)));
  const page=await pdf.getPage(safePage);
  const base=page.getViewport({scale:1});
  const cssWidth=Math.min(300,Math.max(150,canvas.parentElement?.clientWidth-18||220));
  const scale=cssWidth/base.width;
  const pixelRatio=Math.min(1.6,window.devicePixelRatio||1);
  const viewport=page.getViewport({scale:scale*pixelRatio});
  const temp=document.createElement('canvas');
  temp.width=Math.max(1,Math.ceil(viewport.width));
  temp.height=Math.max(1,Math.ceil(viewport.height));
  await page.render({canvasContext:temp.getContext('2d'),viewport}).promise;
  if(canvas.dataset.renderToken!==token)return;
  canvas.width=temp.width;
  canvas.height=temp.height;
  canvas.style.width=`${Math.round(viewport.width/pixelRatio)}px`;
  canvas.style.height=`${Math.round(viewport.height/pixelRatio)}px`;
  canvas.getContext('2d').drawImage(temp,0,0);
  if(status)status.textContent=`صفحة ${safePage}`;
}

function previewMarkup(prefix=''){
  return `<div class="boundary-preview-grid">
    <figure class="boundary-preview-card"><figcaption>${prefix}صفحة البداية</figcaption><canvas data-boundary-canvas="start"></canvas><div class="boundary-preview-status" data-boundary-status="start"></div></figure>
    <figure class="boundary-preview-card"><figcaption>${prefix}صفحة النهاية</figcaption><canvas data-boundary-canvas="end"></canvas><div class="boundary-preview-status" data-boundary-status="end"></div></figure>
  </div>`;
}

function setRangeTitle(box,start,end,count){
  const title=box.querySelector('.boundary-range-title');
  if(title)title.textContent=`من صفحة ${start} إلى صفحة ${end}${count?` — ${count} صفحة محددة`:''}`;
}

async function renderBoundaryBox(box,start,end){
  const pdf=await getPdf();
  if(!pdf)return;
  const startCanvas=box.querySelector('[data-boundary-canvas="start"]');
  const endCanvas=box.querySelector('[data-boundary-canvas="end"]');
  const startStatus=box.querySelector('[data-boundary-status="start"]');
  const endStatus=box.querySelector('[data-boundary-status="end"]');
  if(startCanvas)renderThumb(pdf,start,startCanvas,startStatus).catch(()=>{if(startStatus)startStatus.textContent='تعذر عرض الصفحة'});
  if(endCanvas)renderThumb(pdf,end,endCanvas,endStatus).catch(()=>{if(endStatus)endStatus.textContent='تعذر عرض الصفحة'});
}

function prepareBookOptions(){
  const select=$('#bookStructureMode');
  if(!select||select.dataset.boundaryPrepared)return;
  select.dataset.boundaryPrepared='1';
  const field=select.closest('.field');
  const label=field?.querySelector('label');
  if(label)label.textContent='أريد التقطيع حسب';
  const texts={
    auto:'تلقائي — اكتشاف Unit + Chapter + Lesson',
    unit:'حسب الوحدة Unit — كل وحدة ملف مستقل',
    chapter:'حسب الفصل Chapter — كل Chapter ملف مستقل',
    lesson:'حسب الدرس Lesson — كل درس ملف مستقل',
    part:'حسب الجزء / القسم Part / Section',
    custom:'حسب كلمات مخصصة'
  };
  [...select.options].forEach(option=>{if(texts[option.value])option.textContent=texts[option.value]});
  select.value='chapter';
}

function enhanceBookCards(){
  prepareBookOptions();
  document.querySelectorAll('.book-node:not([data-boundary-preview-ready])').forEach(card=>{
    card.dataset.boundaryPreviewReady='1';
    const startInput=card.querySelector('[data-range="start"]');
    const endInput=card.querySelector('[data-range="end"]');
    if(!startInput||!endInput)return;
    const box=document.createElement('div');
    box.className='book-boundary-preview';
    box.innerHTML=`<div class="boundary-range-title"></div>${previewMarkup()}`;
    const range=card.querySelector('.book-range');
    range?.insertAdjacentElement('beforebegin',box);
    const refresh=()=>{
      const start=Math.max(1,Math.round(Number(startInput.value)||1));
      const end=Math.max(start,Math.round(Number(endInput.value)||start));
      setRangeTitle(box,start,end,end-start+1);
      renderBoundaryBox(box,start,end).catch(()=>{});
    };
    startInput.addEventListener('input',refresh);
    endInput.addEventListener('input',refresh);
    startInput.addEventListener('change',refresh);
    endInput.addEventListener('change',refresh);
    refresh();
  });
}

function parseSplitSelection(pdf){
  const input=$('#pages');
  if(!input)return null;
  try{
    const pages=U().parsePages(input.value,pdf.numPages,{unique:false});
    if(!pages.length)return null;
    return {start:pages[0]+1,end:pages[pages.length-1]+1,count:pages.length};
  }catch{return {error:true}}
}

function installSplitPreview(){
  if(!document.querySelector('[data-tool="split"].active'))return;
  const input=$('#pages');
  const options=$('#options');
  if(!input||!options)return;
  let box=$('#splitBoundaryPreviewBox');
  if(!box){
    box=document.createElement('div');
    box.id='splitBoundaryPreviewBox';
    box.className='split-boundary-box';
    box.innerHTML=`<div class="boundary-range-title">اختر نطاق الصفحات لمعاينته</div>${previewMarkup()}<div class="split-boundary-note">معاينة فقط — لن يتم تنفيذ أي تقطيع قبل الضغط على «تنفيذ».</div>`;
    options.appendChild(box);
  }
  if(input.dataset.boundaryPreviewBound)return;
  input.dataset.boundaryPreviewBound='1';
  let timer=null;
  const refresh=async()=>{
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      const pdf=await getPdf();
      if(!pdf)return;
      const selection=parseSplitSelection(pdf);
      if(!selection)return;
      if(selection.error){
        const title=box.querySelector('.boundary-range-title');
        if(title)title.textContent='صيغة الصفحات غير صحيحة — صحح النطاق لرؤية المعاينة';
        return;
      }
      setRangeTitle(box,selection.start,selection.end,selection.count);
      renderBoundaryBox(box,selection.start,selection.end).catch(()=>{});
    },180);
  };
  input.addEventListener('input',refresh);
  input.addEventListener('change',refresh);
  refresh();
}

function refreshEnhancements(){
  ensureStyles();
  prepareBookOptions();
  enhanceBookCards();
  installSplitPreview();
}

function init(){
  ensureStyles();
  const options=$('#options');
  const results=$('#results');
  const tools=$('#tools');
  const files=$('#files');
  const observer=new MutationObserver(()=>setTimeout(refreshEnhancements,0));
  if(options)observer.observe(options,{childList:true,subtree:true});
  if(results)observer.observe(results,{childList:true,subtree:true});
  tools?.addEventListener('click',()=>setTimeout(refreshEnhancements,40));
  files?.addEventListener('change',()=>{clearPdfCache();setTimeout(refreshEnhancements,120)});
  $('#reset')?.addEventListener('click',()=>{clearPdfCache();setTimeout(refreshEnhancements,40)});
  refreshEnhancements();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
