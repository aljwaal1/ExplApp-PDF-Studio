(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;
const NUMBER='(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
const CHAPTER_WORD='(?:chapter|c\\s*h\\s*a\\s*p\\s*t\\s*e\\s*r|الفصل|الباب)';
const CHAPTER_RE=new RegExp(`^\\s*${CHAPTER_WORD}\\s*(?:no\\.?|number|رقم)?\\s*[:.\\-–—]?\\s*(${NUMBER})(?:\\s|$|[:.\\-–—])`,'iu');
const CHAPTER_WORD_ONLY=new RegExp(`^\\s*${CHAPTER_WORD}\\s*[:.\\-–—]?\\s*$`,'iu');
const NUMBER_ONLY=new RegExp(`^\\s*(${NUMBER})\\s*$`,'iu');

function clean(text){
  return U().clean(String(text||'')).replace(/[\u200e\u200f\u202a-\u202e]/g,'').trim();
}

function normalizeChapterText(text){
  return clean(text)
    .replace(/\bC\s+H\s+A\s+P\s+T\s+E\s+R\b/giu,'CHAPTER')
    .replace(/\s*([:–—-])\s*/g,' $1 ')
    .replace(/\s+/g,' ')
    .trim();
}

function chapterMatch(text){
  const normalized=normalizeChapterText(text);
  const match=normalized.match(CHAPTER_RE);
  return match?{title:normalized,number:match[1]}:null;
}

function rowCandidates(rows){
  const out=[];
  for(let i=0;i<rows.length;i++){
    const here=clean(rows[i]?.text);
    if(!here)continue;
    out.push({text:here,rowIndex:i,row:rows[i]});
    const next=clean(rows[i+1]?.text);
    if(next){
      // Some PDFs store CHAPTER and its number as separate text rows/elements.
      if(CHAPTER_WORD_ONLY.test(normalizeChapterText(here))&&NUMBER_ONLY.test(next)){
        out.push({text:`${here} ${next}`,rowIndex:i,row:rows[i],joined:true});
      }
      // Also try a short two-row combination for split headings.
      if(here.length<=28&&next.length<=28)out.push({text:`${here} ${next}`,rowIndex:i,row:rows[i],joined:true});
    }
  }
  return out;
}

function embeddedChapterFromPage(rows,pageNo,pageHeight){
  const candidates=rowCandidates(rows);
  let best=null;
  for(const candidate of candidates){
    const match=chapterMatch(candidate.text);
    if(!match)continue;
    if(candidate.text.length>90)continue;
    const items=candidate.row?.items||[];
    const size=Math.max(1,...items.map(item=>Number(item.height||item.h||0)).filter(Number.isFinite));
    const y=Math.max(0,...items.map(item=>Number(item.y??item.transform?.[5]??0)).filter(Number.isFinite));
    const topRatio=pageHeight?y/pageHeight:.5;
    let confidence=84;
    if(candidate.rowIndex<=5)confidence+=7;
    if(size>=16)confidence+=5;
    if(topRatio>=.45)confidence+=3;
    if(candidate.joined)confidence-=2;
    const result={type:'chapter',level:2,page:pageNo,title:match.title,confidence:Math.min(99,confidence),size,y};
    if(!best||result.confidence>best.confidence)best=result;
  }
  return best;
}

async function scanEmbedded(pdf){
  const chapters=[];
  let totalTextChars=0;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    U().setProgress(3+(pageNo/pdf.numPages)*55,`البحث عن CHAPTER — الصفحة ${pageNo} من ${pdf.numPages}`);
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    totalTextChars+=content.items.reduce((sum,item)=>sum+String(item.str||'').length,0);
    const rows=U().groupRows(content.items,{rtl:'auto'});
    const found=embeddedChapterFromPage(rows,pageNo,page.getViewport({scale:1}).height);
    if(found)chapters.push(found);
  }
  return {chapters,totalTextChars};
}

async function renderOcrTop(page){
  const base=page.getViewport({scale:1});
  const scale=Math.min(1.35,Math.max(.9,900/base.width));
  const viewport=page.getViewport({scale});
  const full=document.createElement('canvas');
  full.width=Math.ceil(viewport.width);
  full.height=Math.ceil(viewport.height);
  const ctx=full.getContext('2d',{willReadFrequently:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,full.width,full.height);
  await page.render({canvasContext:ctx,viewport}).promise;
  // Chapter headings are normally in the upper part of opening pages.
  const crop=document.createElement('canvas');
  crop.width=full.width;
  crop.height=Math.max(120,Math.ceil(full.height*.58));
  crop.getContext('2d').drawImage(full,0,0,full.width,crop.height,0,0,crop.width,crop.height);
  return crop;
}

function chapterFromOcrText(text,pageNo){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
  const attempts=[...lines];
  for(let i=0;i<lines.length-1;i++){
    if(lines[i].length<=30&&lines[i+1].length<=30)attempts.push(`${lines[i]} ${lines[i+1]}`);
  }
  attempts.push(clean(lines.join(' ')));
  for(const attempt of attempts){
    const match=chapterMatch(attempt);
    if(match)return {type:'chapter',level:2,page:pageNo,title:match.title,confidence:78,size:0,y:0,ocr:true};
  }
  return null;
}

async function scanWithOcr(pdf){
  if(!window.Tesseract?.createWorker)return [];
  const chapters=[];
  let worker=null;
  try{
    U().setProgress(60,'تشغيل OCR لاكتشاف CHAPTER في الصفحات المصورة…');
    worker=await Tesseract.createWorker('eng');
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      U().setProgress(60+(pageNo/pdf.numPages)*28,`OCR لعناوين الفصول — الصفحة ${pageNo} من ${pdf.numPages}`);
      const page=await pdf.getPage(pageNo);
      const canvas=await renderOcrTop(page);
      const result=await worker.recognize(canvas);
      const found=chapterFromOcrText(result?.data?.text||'',pageNo);
      if(found)chapters.push(found);
    }
  }finally{
    try{await worker?.terminate()}catch{}
  }
  return chapters;
}

function dedupe(chapters){
  const byPage=new Map();
  for(const chapter of chapters.sort((a,b)=>a.page-b.page||b.confidence-a.confidence)){
    const current=byPage.get(chapter.page);
    if(!current||chapter.confidence>current.confidence)byPage.set(chapter.page,chapter);
  }
  const out=[...byPage.values()].sort((a,b)=>a.page-b.page);
  const unique=[];
  for(const item of out){
    const previous=unique[unique.length-1];
    if(previous&&item.page===previous.page)continue;
    unique.push(item);
  }
  return unique;
}

function infer(chapters,totalPages){
  return chapters.map((chapter,index)=>({
    ...chapter,id:`chapter-${index+1}`,start:chapter.page,
    end:index<chapters.length-1?Math.max(chapter.page,chapters[index+1].page-1):totalPages,
    parentId:null,autoEnd:true
  }));
}

async function sectionBytes(sourceBytes,from,to){
  const source=await PDFLib.PDFDocument.load(sourceBytes.slice(0));
  const output=await PDFLib.PDFDocument.create();
  const indices=[];for(let page=from;page<=to;page++)indices.push(page-1);
  (await output.copyPages(source,indices)).forEach(page=>output.addPage(page));
  return output.save();
}

function render(sections,file,sourceBytes){
  const results=$('#results');
  results.innerHTML='';
  const summary=document.createElement('div');
  summary.className='result book-summary';
  summary.innerHTML=`<b>تم اكتشاف ${sections.length} Chapter</b><small>كل فصل سيُقطع من صفحة البداية حتى الصفحة السابقة لبداية Chapter التالي. راجع معاينة البداية والنهاية قبل التنزيل.</small><div class="book-actions"><button class="primary" id="enhancedChapterDownloadAll">تنزيل جميع Chapters ZIP</button></div>`;
  results.appendChild(summary);
  sections.forEach((section,index)=>{
    const card=document.createElement('div');
    card.className='result book-node';
    card.dataset.sectionId=section.id;
    card.innerHTML=`<div class="book-node-head"><div class="book-title">📘 ${U().escapeHtml(section.title)}</div><span class="book-badge">Chapter • ثقة ${section.confidence}%${section.ocr?' • OCR':''}</span></div><div class="book-meta">من صفحة ${section.start} إلى صفحة ${section.end} • ${section.end-section.start+1} صفحة</div><div class="book-range"><label>بداية الفصل<input type="number" min="1" value="${section.start}" data-range="start"></label><label>نهاية الفصل<input type="number" min="1" value="${section.end}" data-range="end"></label><button data-download>تنزيل هذا الفصل</button></div>`;
    const start=card.querySelector('[data-range="start"]'),end=card.querySelector('[data-range="end"]');
    const update=()=>{
      section.start=Math.max(1,Math.round(Number(start.value)||section.start));
      section.end=Math.max(section.start,Math.round(Number(end.value)||section.end));
      start.value=section.start;end.value=section.end;
      card.querySelector('.book-meta').textContent=`من صفحة ${section.start} إلى صفحة ${section.end} • ${section.end-section.start+1} صفحة • تم تعديل النطاق يدويًا`;
    };
    start.addEventListener('change',update);end.addEventListener('change',update);
    card.querySelector('[data-download]').addEventListener('click',async()=>{
      try{U().download(await sectionBytes(sourceBytes,section.start,section.end),`${String(index+1).padStart(2,'0')}-${U().safeName(section.title)}.pdf`,'application/pdf')}catch(error){alert(error.message||'تعذر تنزيل الفصل')}
    });
    results.appendChild(card);
  });
  $('#enhancedChapterDownloadAll')?.addEventListener('click',async()=>{
    try{
      const zip=new JSZip();
      for(let i=0;i<sections.length;i++){
        const section=sections[i];
        U().setProgress(90+(i/Math.max(1,sections.length))*9,`تجهيز Chapter ${i+1} من ${sections.length}`);
        zip.file(`${String(i+1).padStart(2,'0')}-${U().safeName(section.title)}.pdf`,await sectionBytes(sourceBytes,section.start,section.end));
      }
      U().download(await zip.generateAsync({type:'blob'}),`${U().safeName(file.name)}-chapters.zip`,'application/zip');
      U().hideProgress();
    }catch(error){U().hideProgress();alert(error.message||'تعذر تنزيل الفصول')}
  });
}

async function runEnhancedChapter(){
  const file=window.ExplAppSession?.getActiveFile?.()||[...($('#files')?.files||[])][0];
  if(!file)throw Error('اختر ملف PDF');
  const sourceBytes=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
  const embedded=await scanEmbedded(pdf);
  let chapters=dedupe(embedded.chapters);
  // OCR fallback is intentionally only used when embedded PDF text cannot produce useful chapter boundaries.
  if(chapters.length<2){
    const ocr=await scanWithOcr(pdf);
    chapters=dedupe([...chapters,...ocr]);
  }
  U().hideProgress();
  if(!chapters.length){
    $('#results').innerHTML='<div class="result"><b>لم أجد CHAPTER واضحًا</b><small>تم فحص النص المضمّن وOCR. إذا كان عنوان الفصل بصيغة مختلفة، استخدم الكلمات المخصصة أو أرسل مثالًا آخر.</small></div>';
    return;
  }
  render(infer(chapters,pdf.numPages),file,sourceBytes);
}

function init(){
  const run=$('#run');
  if(!run)return;
  // This listener is loaded before the legacy book analyzer and takes over only Chapter mode.
  run.addEventListener('click',async event=>{
    const bookActive=Boolean(document.querySelector('#tools [data-tool="book"].active'));
    const mode=$('#bookStructureMode')?.value||'chapter';
    if(!bookActive||mode!=='chapter')return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;$('#results').innerHTML='';await runEnhancedChapter()}
    catch(error){console.error(error);U()?.hideProgress();alert(error.message||'تعذر اكتشاف Chapters')}
    finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
