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
  return U().clean(String(text||'')).replace(/[\\u200e\\u200f\\u202a-\\u202e]/g,'').trim();
}

function normalizeChapterText(text){
  return clean(text)
    .replace(/\\bC\\s+H\\s+A\\s+P\\s+T\\s+E\\s+R\\b/giu,'CHAPTER')
    .replace(/\\s*([:–—-])\\s*/g,' $1 ')
    .replace(/\\s+/g,' ')
    .trim();
}

function chapterMatch(text){
  const normalized=normalizeChapterText(text);
  const match=normalized.match(CHAPTER_RE);
  return match?{title:normalized,number:match[1]}:null;
}

function rowMetric(row){
  const items=row?.items||[];
  const size=Math.max(1,...items.map(item=>Number(item.height||item.h||0)).filter(Number.isFinite));
  const y=Math.max(0,...items.map(item=>Number(item.y??item.transform?.[5]??0)).filter(Number.isFinite));
  return {size,y};
}

function looksLikeTocLine(text){
  const t=clean(text);
  if(!t)return false;
  if(/\\.{2,}\\s*\\d+\\s*$/u.test(t))return true;
  if(/(?:chapter|الفصل|الباب)\\b.*\\s+\\d+\\s*$/iu.test(t)&&t.length>24)return true;
  return false;
}

function pageIsContents(rows){
  const texts=rows.map(row=>clean(row.text)).filter(Boolean);
  const head=texts.slice(0,10).join(' ');
  if(/(?:table\\s+of\\s+contents|contents|الفهرس|المحتويات|جدول\\s+المحتويات)/iu.test(head))return true;
  let chapterRefs=0,dotLeaders=0,pageNumberEndings=0;
  for(const text of texts){
    if(chapterMatch(text)||new RegExp(CHAPTER_WORD,'iu').test(text))chapterRefs++;
    if(/\\.{2,}\\s*\\d+\\s*$/u.test(text))dotLeaders++;
    if(/\\s\\d{1,4}\\s*$/u.test(text)&&text.length>12)pageNumberEndings++;
  }
  if(chapterRefs>=3&&(dotLeaders>=1||pageNumberEndings>=3))return true;
  if(chapterRefs>=5)return true;
  return false;
}

function rowCandidates(rows){
  const out=[];
  for(let i=0;i<rows.length;i++){
    const here=clean(rows[i]?.text);
    if(!here)continue;
    out.push({text:here,rowIndex:i,row:rows[i]});
    const next=clean(rows[i+1]?.text);
    if(next){
      if(CHAPTER_WORD_ONLY.test(normalizeChapterText(here))&&NUMBER_ONLY.test(next))out.push({text:`${here} ${next}`,rowIndex:i,row:rows[i],joined:true});
      if(here.length<=28&&next.length<=28)out.push({text:`${here} ${next}`,rowIndex:i,row:rows[i],joined:true});
    }
  }
  return out;
}

function titleAfterHeading(rows,rowIndex,headingSize){
  const pieces=[];
  for(let offset=1;offset<=3;offset++){
    const row=rows[rowIndex+offset];
    if(!row)break;
    const text=clean(row.text);
    if(!text||text.length<3||text.length>110)continue;
    if(chapterMatch(text)||CHAPTER_WORD_ONLY.test(normalizeChapterText(text))||NUMBER_ONLY.test(text)||looksLikeTocLine(text))continue;
    if(/^(?:learning\\s+objectives?|objectives?|questions?|exercises?|summary|references?|contents)$/iu.test(text))continue;
    const {size}=rowMetric(row);
    if(headingSize>0&&size<headingSize*.55&&text.split(/\\s+/).length>12)continue;
    pieces.push(text);
    if(pieces.join(' ').length>=65||pieces.length>=2)break;
  }
  return clean(pieces.join(' — '));
}

function canonicalChapterTitle(match,subtitle){
  const number=clean(match.number);
  return subtitle?`Chapter ${number} - ${subtitle}`:`Chapter ${number}`;
}

function embeddedChapterFromPage(rows,pageNo,pageHeight){
  if(pageIsContents(rows))return null;
  const candidates=rowCandidates(rows);
  let best=null;
  for(const candidate of candidates){
    const match=chapterMatch(candidate.text);
    if(!match||candidate.text.length>90||looksLikeTocLine(candidate.text))continue;
    const {size,y}=rowMetric(candidate.row);
    const topRatio=pageHeight?y/pageHeight:.5;
    let confidence=86;
    if(candidate.rowIndex<=6)confidence+=6;
    if(size>=16)confidence+=5;
    if(topRatio>=.38)confidence+=2;
    if(candidate.joined)confidence-=2;
    const subtitle=titleAfterHeading(rows,candidate.rowIndex+(candidate.joined?1:0),size);
    const result={type:'chapter',level:2,page:pageNo,title:canonicalChapterTitle(match,subtitle),chapterNumber:match.number,subtitle,confidence:Math.min(99,confidence),size,y};
    if(!best||result.confidence>best.confidence)best=result;
  }
  return best;
}

async function scanEmbedded(pdf){
  const chapters=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    U().setProgress(3+(pageNo/pdf.numPages)*55,`البحث عن CHAPTER — الصفحة ${pageNo} من ${pdf.numPages}`);
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const rows=U().groupRows(content.items,{rtl:'auto'});
    const found=embeddedChapterFromPage(rows,pageNo,page.getViewport({scale:1}).height);
    if(found)chapters.push(found);
  }
  return chapters;
}

async function renderOcrTop(page){
  const base=page.getViewport({scale:1});
  const scale=Math.min(1.35,Math.max(.9,900/base.width));
  const viewport=page.getViewport({scale});
  const full=document.createElement('canvas');
  full.width=Math.ceil(viewport.width);full.height=Math.ceil(viewport.height);
  const ctx=full.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,full.width,full.height);
  await page.render({canvasContext:ctx,viewport}).promise;
  const crop=document.createElement('canvas');crop.width=full.width;crop.height=Math.max(120,Math.ceil(full.height*.62));
  crop.getContext('2d').drawImage(full,0,0,full.width,crop.height,0,0,crop.width,crop.height);
  return crop;
}

function ocrLooksLikeContents(text){
  const raw=String(text||'');
  if(/(?:table\\s+of\\s+contents|contents|الفهرس|المحتويات)/iu.test(raw))return true;
  return (raw.match(/chapter\\s*(?:\\d+|[ivxlcdm]+)/giu)||[]).length>=3;
}

function chapterFromOcrText(text,pageNo){
  if(ocrLooksLikeContents(text))return null;
  const lines=String(text||'').split(/\\r?\\n/).map(clean).filter(Boolean);
  const attempts=[...lines];
  for(let i=0;i<lines.length-1;i++)if(lines[i].length<=35&&lines[i+1].length<=35)attempts.push(`${lines[i]} ${lines[i+1]}`);
  for(const attempt of attempts){
    const match=chapterMatch(attempt);
    if(!match)continue;
    const index=lines.indexOf(attempt);
    const subtitle=index>=0?clean(lines.slice(index+1,index+3).filter(line=>line.length>=3&&line.length<=100&&!chapterMatch(line)&&!looksLikeTocLine(line)).join(' — ')):'';
    return {type:'chapter',level:2,page:pageNo,title:canonicalChapterTitle(match,subtitle),chapterNumber:match.number,subtitle,confidence:80,size:0,y:0,ocr:true};
  }
  return null;
}

async function scanWithOcr(pdf){
  if(!window.Tesseract?.createWorker)return [];
  const chapters=[];let worker=null;
  try{
    U().setProgress(60,'تشغيل OCR لاكتشاف CHAPTER في الصفحات المصورة…');
    worker=await Tesseract.createWorker('eng');
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      U().setProgress(60+(pageNo/pdf.numPages)*28,`OCR لعناوين الفصول — الصفحة ${pageNo} من ${pdf.numPages}`);
      const page=await pdf.getPage(pageNo);
      const result=await worker.recognize(await renderOcrTop(page));
      const found=chapterFromOcrText(result?.data?.text||'',pageNo);
      if(found)chapters.push(found);
    }
  }finally{try{await worker?.terminate()}catch{}}
  return chapters;
}

function dedupe(chapters){
  const byNumber=new Map();
  for(const chapter of [...chapters].sort((a,b)=>a.page-b.page||b.confidence-a.confidence)){
    const key=clean(chapter.chapterNumber||chapter.title).toLowerCase();
    const current=byNumber.get(key);
    if(!current){byNumber.set(key,chapter);continue}
    if(chapter.page>current.page&&chapter.confidence>=current.confidence-6)byNumber.set(key,chapter);
    else if(chapter.confidence>current.confidence+8)byNumber.set(key,chapter);
  }
  return [...byNumber.values()].sort((a,b)=>a.page-b.page);
}

function infer(chapters,totalPages){
  return chapters.map((chapter,index)=>({...chapter,id:`chapter-${index+1}`,start:chapter.page,end:index<chapters.length-1?Math.max(chapter.page,chapters[index+1].page-1):totalPages,parentId:null,autoEnd:true}));
}

function ensureChapterOptions(){
  if(!document.querySelector('#tools [data-tool="book"].active')||($('#bookStructureMode')?.value||'chapter')!=='chapter')return;
  const options=$('#options');if(!options||$('#chapterExportOptions'))return;
  const box=document.createElement('div');box.id='chapterExportOptions';box.className='note';box.style.marginTop='10px';
  box.innerHTML=`<b>إعداد ملفات الفصول</b><div class="row" style="margin-top:8px"><div class="field"><label style="display:flex;align-items:center;gap:8px"><input id="chapterIncludeCover" type="checkbox" checked style="width:auto"> إضافة صفحة غلاف الكتاب في بداية كل فصل</label></div><div class="field"><label>رقم صفحة الغلاف</label><input id="chapterCoverPage" type="number" min="1" value="1"></div></div><small>الغلاف لا يغيّر حدود الفصل؛ يتم نسخه كأول صفحة داخل ملف الفصل عند التنزيل فقط.</small>`;
  options.appendChild(box);
}

function exportSettings(totalPages){
  return {includeCover:$('#chapterIncludeCover')?.checked!==false,coverPage:Math.max(1,Math.min(totalPages,Math.round(Number($('#chapterCoverPage')?.value||1)))};
}

async function sectionBytes(sourceBytes,from,to,{includeCover=false,coverPage=1}={}){
  const source=await PDFLib.PDFDocument.load(sourceBytes.slice(0));
  const output=await PDFLib.PDFDocument.create();const indices=[];
  if(includeCover&&!(coverPage>=from&&coverPage<=to))indices.push(coverPage-1);
  for(let page=from;page<=to;page++)indices.push(page-1);
  (await output.copyPages(source,indices)).forEach(page=>output.addPage(page));
  return output.save();
}

function fileNameFor(section,index){
  const number=clean(section.chapterNumber)||String(index+1);const subtitle=clean(section.subtitle);
  return `${String(index+1).padStart(2,'0')}-${U().safeName(subtitle?`Chapter ${number} - ${subtitle}`:`Chapter ${number}`)}.pdf`;
}

function render(sections,file,sourceBytes,totalPages){
  const results=$('#results');results.innerHTML='';const settings=exportSettings(totalPages);
  const summary=document.createElement('div');summary.className='result book-summary';
  summary.innerHTML=`<b>تم اكتشاف ${sections.length} Chapter حقيقي</b><small>تم استبعاد صفحات الفهرس عند ظهور Contents أو عدة Chapters في صفحة واحدة أو أرقام صفحات/نقاط فهرس. اسم كل ملف يعتمد على رقم الفصل والعنوان الموجود تحت CHAPTER. ${settings.includeCover?`سيتم إضافة صفحة الغلاف ${settings.coverPage} في بداية كل فصل.`:'لن تتم إضافة غلاف.'}</small><div class="book-actions"><button class="primary" id="enhancedChapterDownloadAll">تنزيل جميع Chapters ZIP</button></div>`;
  results.appendChild(summary);
  sections.forEach((section,index)=>{
    const card=document.createElement('div');card.className='result book-node';card.dataset.sectionId=section.id;
    card.innerHTML=`<div class="book-node-head"><div class="book-title">📘 ${U().escapeHtml(section.title)}</div><span class="book-badge">Chapter • ثقة ${section.confidence}%${section.ocr?' • OCR':''}</span></div><div class="book-meta">من صفحة ${section.start} إلى صفحة ${section.end} • ${section.end-section.start+1} صفحة${settings.includeCover?` • + غلاف صفحة ${settings.coverPage}`:''}</div><div class="book-range"><label>بداية الفصل<input type="number" min="1" max="${totalPages}" value="${section.start}" data-range="start"></label><label>نهاية الفصل<input type="number" min="1" max="${totalPages}" value="${section.end}" data-range="end"></label><button data-download>تنزيل هذا الفصل</button></div>`;
    const start=card.querySelector('[data-range="start"]'),end=card.querySelector('[data-range="end"]');
    const update=()=>{section.start=Math.max(1,Math.min(totalPages,Math.round(Number(start.value)||section.start)));section.end=Math.max(section.start,Math.min(totalPages,Math.round(Number(end.value)||section.end)));start.value=section.start;end.value=section.end;card.querySelector('.book-meta').textContent=`من صفحة ${section.start} إلى صفحة ${section.end} • ${section.end-section.start+1} صفحة • تم تعديل النطاق يدويًا`};
    start.addEventListener('change',update);end.addEventListener('change',update);
    card.querySelector('[data-download]').addEventListener('click',async()=>{try{U().download(await sectionBytes(sourceBytes,section.start,section.end,exportSettings(totalPages)),fileNameFor(section,index),'application/pdf')}catch(error){alert(error.message||'تعذر تنزيل الفصل')}});
    results.appendChild(card);
  });
  $('#enhancedChapterDownloadAll')?.addEventListener('click',async()=>{try{const zip=new JSZip(),opts=exportSettings(totalPages);for(let i=0;i<sections.length;i++){const section=sections[i];U().setProgress(90+(i/Math.max(1,sections.length))*9,`تجهيز Chapter ${i+1} من ${sections.length}`);zip.file(fileNameFor(section,i),await sectionBytes(sourceBytes,section.start,section.end,opts))}U().download(await zip.generateAsync({type:'blob'}),`${U().safeName(file.name)}-chapters.zip`,'application/zip');U().hideProgress()}catch(error){U().hideProgress();alert(error.message||'تعذر تنزيل الفصول')}});
}

async function runEnhancedChapter(){
  ensureChapterOptions();
  const file=window.ExplAppSession?.getActiveFile?.()||[...($('#files')?.files||[])][0];if(!file)throw Error('اختر ملف PDF');
  const sourceBytes=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
  let chapters=dedupe(await scanEmbedded(pdf));
  if(chapters.length<2)chapters=dedupe([...chapters,...await scanWithOcr(pdf)]);
  U().hideProgress();
  if(!chapters.length){$('#results').innerHTML='<div class="result"><b>لم أجد بداية Chapter حقيقية</b><small>تم تجاهل صفحات الفهرس وفحص النص المضمّن وOCR. إذا كان الكتاب يستخدم صيغة مختلفة للعناوين، جرّب الكلمات المخصصة.</small></div>';return}
  render(infer(chapters,pdf.numPages),file,sourceBytes,pdf.numPages);
}

function init(){
  const run=$('#run'),tools=$('#tools');if(!run)return;
  const refresh=()=>setTimeout(ensureChapterOptions,40);tools?.addEventListener('click',refresh);document.addEventListener('change',event=>{if(event.target?.id==='bookStructureMode')refresh()});
  run.addEventListener('click',async event=>{const bookActive=Boolean(document.querySelector('#tools [data-tool="book"].active'));const mode=$('#bookStructureMode')?.value||'chapter';if(!bookActive||mode!=='chapter')return;event.preventDefault();event.stopImmediatePropagation();try{run.disabled=true;$('#results').innerHTML='';await runEnhancedChapter()}catch(error){console.error(error);U()?.hideProgress();alert(error.message||'تعذر اكتشاف Chapters')}finally{run.disabled=false}},true);
  refresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
