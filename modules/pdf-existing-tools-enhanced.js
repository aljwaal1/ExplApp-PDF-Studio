(()=>{
'use strict';

const SUPPORTED=new Set(['images','book','batch','blank','compare']);
let activeTool='';
const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;

function currentButton(){return activeTool?document.querySelector(`[data-tool="${activeTool}"].active`):null}
function files(){return [...($('#files')?.files||[])]}
function setProgress(value,message){U()?.setProgress(value,message)}
function hideProgress(){U()?.hideProgress()}

function optionsFor(tool){
  const templates={
    images:`<div class="row"><div class="field"><label>الصفحات</label><input id="imgPages" type="text" placeholder="فارغ = الكل"></div><div class="field"><label>الصيغة</label><select id="imgFormat"><option value="png">PNG</option><option value="jpeg">JPG</option></select></div><div class="field"><label>الدقة</label><select id="imgDpi"><option value="96">96 DPI سريع</option><option value="144" selected>144 DPI متوازن</option><option value="192">192 DPI واضح</option><option value="240">240 DPI عالي</option></select></div><div class="field"><label>جودة JPG</label><select id="imgQuality"><option value="0.75">75%</option><option value="0.88" selected>88%</option><option value="0.95">95%</option></select></div></div><div class="note">يمكن تحديد صفحات معينة. الصفحة الواحدة تنزل مباشرة، والصفحات المتعددة داخل ZIP.</div>`,
    book:`<div class="row"><div class="field"><label>كلمات العناوين</label><input id="bookPattern" type="text" value="الفصل|الوحدة|الباب|القسم|الدرس|chapter|unit|section|part"></div><div class="field"><label>حساسية اكتشاف العناوين</label><select id="bookSensitivity"><option value="loose">مرنة</option><option value="auto" selected>متوازنة</option><option value="strict">دقيقة</option></select></div></div><div class="note">يستخدم كلمات العناوين وحجم الخط معًا، ثم يعرض الفصول قبل تنزيلها.</div>`,
    batch:`<div class="row"><div class="field"><label>صيغة الإخراج</label><select id="batchOutput"><option value="md">Markdown</option><option value="txt">TXT</option></select></div><div class="field"><label>طريقة القراءة</label><select id="batchSource"><option value="auto">اكتشاف تلقائي</option><option value="text">نص أصلي فقط</option><option value="ocr">OCR عربي وإنجليزي</option></select></div></div><div class="note">يعالج كل الملفات المحددة بنفس الإعدادات ويضع النتائج داخل ZIP.</div>`,
    blank:`<div class="row"><div class="field"><label>أقصى حروف للصفحة الفارغة</label><input id="blankChars" type="text" value="8"></div><div class="field"><label>حساسية الصورة</label><select id="blankInk"><option value="0.002">دقيقة</option><option value="0.006" selected>متوازنة</option><option value="0.015">مرنة</option></select></div></div><div class="note">سيتم عرض الصفحات المرشحة مع معاينة قبل الحذف.</div>`,
    compare:`<div class="row"><div class="field"><label>نوع المقارنة</label><select id="compareMode"><option value="normalized">تجاهل المسافات والاختلافات البسيطة</option><option value="exact">مطابقة حرفية</option></select></div><div class="field"><label>حد اعتبار الصفحة متغيرة</label><select id="compareThreshold"><option value="0.95">اختلاف بسيط</option><option value="0.85" selected>اختلاف واضح</option><option value="0.70">اختلاف كبير فقط</option></select></div></div><div class="note">يعرض الصفحات المتغيرة والمضافة والمحذوفة مع إمكانية تصدير تقرير CSV.</div>`
  };
  const options=$('#options');if(!options)return;
  options.classList.remove('hidden');options.innerHTML=templates[tool]||'';
}

async function loadPdf(file){
  return pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
}

async function extractPageText(pdf,pageNo){
  const page=await pdf.getPage(pageNo);const content=await page.getTextContent();
  const rows=U().groupRows(content.items,{rtl:'auto'});
  return rows.map(row=>row.text).join('\n').trim();
}

async function renderPageCanvas(page,scale,background='#fff'){
  const viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:context,viewport}).promise;return canvas;
}

async function runImages(){
  const file=files()[0];if(!file)throw Error('اختر ملف PDF');
  const pdf=await loadPdf(file);const pages=U().parsePages($('#imgPages')?.value||'',pdf.numPages);
  const format=$('#imgFormat')?.value||'png';const dpi=Number($('#imgDpi')?.value||144);const quality=Number($('#imgQuality')?.value||.88);
  const extension=format==='jpeg'?'jpg':'png';const mime=format==='jpeg'?'image/jpeg':'image/png';const output=[];
  for(let index=0;index<pages.length;index++){
    const pageNo=pages[index]+1;setProgress(5+(index/pages.length)*88,`تحويل الصفحة ${pageNo} إلى ${extension.toUpperCase()}`);
    const page=await pdf.getPage(pageNo);const canvas=await renderPageCanvas(page,dpi/72);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('تعذر إنشاء الصورة')),mime,quality));
    output.push({pageNo,blob});
  }
  const base=U().safeName(file.name);
  if(output.length===1)U().download(output[0].blob,`${base}-page-${output[0].pageNo}.${extension}`,mime);
  else{
    const zip=new JSZip();output.forEach(item=>zip.file(`${base}-page-${String(item.pageNo).padStart(3,'0')}.${extension}`,item.blob));
    U().download(await zip.generateAsync({type:'blob'}),`${base}-images.zip`,'application/zip');
  }
  setProgress(100,'تم تحويل الصفحات');setTimeout(hideProgress,900);
}

function headingRatio(){
  const value=$('#bookSensitivity')?.value||'auto';return value==='loose'?1.15:value==='strict'?1.55:1.32;
}

async function detectHeadings(pdf){
  let pattern;try{pattern=new RegExp($('#bookPattern')?.value||'', 'i')}catch{throw Error('صيغة كلمات العناوين غير صحيحة')}
  const headings=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    setProgress(5+(pageNo/pdf.numPages)*82,`فحص عناوين الصفحة ${pageNo}`);
    const page=await pdf.getPage(pageNo);const content=await page.getTextContent();const rows=U().groupRows(content.items,{rtl:'auto'});
    const base=U().median(rows.flatMap(row=>row.items.map(item=>item.height)))||10;
    for(const row of rows){
      const text=U().clean(row.text);const size=Math.max(...row.items.map(item=>item.height));
      const keyword=pattern.source&&pattern.test(text);const large=size>=base*headingRatio();
      if(text.length>=3&&text.length<=140&&(keyword||large)){
        const previous=headings.at(-1);if(previous&&previous.page===pageNo&&previous.title===text)continue;
        headings.push({page:pageNo,title:text,size,keyword});
      }
    }
  }
  return headings.filter((heading,index)=>index===0||heading.page!==headings[index-1].page||heading.title!==headings[index-1].title);
}

async function chapterBytes(sourceBytes,from,to){
  const source=await PDFLib.PDFDocument.load(sourceBytes.slice(0));const output=await PDFLib.PDFDocument.create();
  const indices=[];for(let page=from;page<=to;page++)indices.push(page-1);
  const pages=await output.copyPages(source,indices);pages.forEach(page=>output.addPage(page));return output.save();
}

async function runBook(){
  const file=files()[0];if(!file)throw Error('اختر ملف PDF');const sourceBytes=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
  const headings=await detectHeadings(pdf);hideProgress();const results=$('#results');results.innerHTML='';
  if(!headings.length){results.innerHTML='<div class="result">لم يتم اكتشاف عناوين واضحة. عدّل كلمات العناوين أو الحساسية.</div>';return}
  const chapters=headings.map((heading,index)=>({...heading,end:(headings[index+1]?.page||pdf.numPages+1)-1})).filter(chapter=>chapter.end>=chapter.page);
  const all=document.createElement('button');all.className='primary';all.textContent='تنزيل جميع الفصول ZIP';all.onclick=async()=>{
    const zip=new JSZip();for(let index=0;index<chapters.length;index++){
      setProgress(5+(index/chapters.length)*90,`تجهيز الفصل ${index+1}`);const chapter=chapters[index];
      zip.file(`${String(index+1).padStart(2,'0')}-${U().safeName(chapter.title).slice(0,70)}.pdf`,await chapterBytes(sourceBytes,chapter.page,chapter.end));
    }
    U().download(await zip.generateAsync({type:'blob'}),`${U().safeName(file.name)}-chapters.zip`,'application/zip');hideProgress();
  };results.appendChild(all);
  chapters.forEach((chapter,index)=>{
    const card=document.createElement('div');card.className='result';card.innerHTML=`<b>${U().escapeHtml(chapter.title)}</b><small>الصفحات ${chapter.page}–${chapter.end}</small>`;
    card.onclick=async()=>U().download(await chapterBytes(sourceBytes,chapter.page,chapter.end),`${String(index+1).padStart(2,'0')}-${U().safeName(chapter.title)}.pdf`,'application/pdf');results.appendChild(card);
  });
}

function pageMarkdown(text,pageNo){
  const paragraphs=text.split(/\n+/).map(U().clean).filter(Boolean);return `## الصفحة ${pageNo}\n\n${paragraphs.join('\n\n')}`;
}

async function recognizePage(page,worker){
  const canvas=await renderPageCanvas(page,2);const result=await worker.recognize(canvas);return result.data.text.trim();
}

async function runBatch(){
  const input=files();if(!input.length)throw Error('اختر ملف PDF واحدًا أو أكثر');
  const format=$('#batchOutput')?.value||'md';const source=$('#batchSource')?.value||'auto';const zip=new JSZip();let worker=null;
  try{
    for(let fileIndex=0;fileIndex<input.length;fileIndex++){
      const file=input[fileIndex];const pdf=await loadPdf(file);const pages=[];
      for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
        setProgress(3+((fileIndex+(pageNo/pdf.numPages))/input.length)*91,`معالجة ${file.name} — الصفحة ${pageNo}`);
        const page=await pdf.getPage(pageNo);const content=await page.getTextContent();const nativeText=content.items.map(item=>item.str||'').join(' ').trim();
        const useOcr=source==='ocr'||(source==='auto'&&nativeText.replace(/\s/g,'').length<20);
        if(useOcr){if(!navigator.onLine)throw Error('OCR يحتاج الإنترنت في أول استخدام');if(!worker)worker=await Tesseract.createWorker('ara+eng');pages.push(await recognizePage(page,worker))}
        else pages.push((await extractPageText(pdf,pageNo))||nativeText);
      }
      const base=U().safeName(file.name);const content=format==='md'?pages.map(pageMarkdown).join('\n\n---\n\n'):'\ufeff'+pages.map((text,index)=>`--- الصفحة ${index+1} ---\n${text}`).join('\n\n');
      zip.file(`${base}.${format}`,content);
    }
  }finally{if(worker)await worker.terminate()}
  U().download(await zip.generateAsync({type:'blob'}),'pdf-batch-output.zip','application/zip');setProgress(100,'اكتملت المعالجة الجماعية');setTimeout(hideProgress,900);
}

async function pageBlankScore(page){
  const content=await page.getTextContent();const chars=content.items.map(item=>item.str||'').join('').replace(/\s/g,'').length;
  const canvas=await renderPageCanvas(page,.28);const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let dark=0,samples=0;for(let index=0;index<data.length;index+=16){samples++;if((data[index]+data[index+1]+data[index+2])/3<238)dark++}
  return {chars,ink:samples?dark/samples:0,canvas};
}

async function runBlank(){
  const file=files()[0];if(!file)throw Error('اختر ملف PDF');const bytes=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
  const maxChars=Math.max(0,Number(U().normalizeDigits($('#blankChars')?.value||8))||8);const maxInk=Number($('#blankInk')?.value||.006);
  const candidates=[];const results=$('#results');results.innerHTML='';
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    setProgress(5+(pageNo/pdf.numPages)*80,`فحص الصفحة ${pageNo}`);const score=await pageBlankScore(await pdf.getPage(pageNo));
    if(score.chars<=maxChars&&score.ink<=maxInk)candidates.push({pageNo,...score});
  }
  hideProgress();if(!candidates.length){results.innerHTML='<div class="result">لم يتم اكتشاف صفحات فارغة وفق الإعدادات الحالية.</div>';return}
  const header=document.createElement('div');header.className='result';header.innerHTML=`<b>تم ترشيح ${candidates.length} صفحة</b><small>ألغِ تحديد أي صفحة تريد الاحتفاظ بها.</small>`;results.appendChild(header);
  candidates.forEach(item=>{
    const card=document.createElement('label');card.className='result';card.style.display='grid';card.style.gridTemplateColumns='auto 90px 1fr';card.style.gap='10px';card.style.alignItems='center';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.dataset.blankPage=item.pageNo;
    item.canvas.style.width='80px';item.canvas.style.maxHeight='110px';const text=document.createElement('span');text.innerHTML=`<b>الصفحة ${item.pageNo}</b><small>${item.chars} حرف — كثافة ${(item.ink*100).toFixed(3)}%</small>`;
    card.append(checkbox,item.canvas,text);results.appendChild(card);
  });
  const downloadButton=document.createElement('button');downloadButton.className='primary';downloadButton.textContent='حذف المحدد وتنزيل PDF';downloadButton.onclick=async()=>{
    const remove=new Set([...results.querySelectorAll('[data-blank-page]:checked')].map(input=>Number(input.dataset.blankPage)-1));
    if(!remove.size){alert('لم تحدد صفحات للحذف');return}if(remove.size>=pdf.numPages){alert('لا يمكن حذف جميع الصفحات');return}
    const source=await PDFLib.PDFDocument.load(bytes.slice(0));const output=await PDFLib.PDFDocument.create();const keep=source.getPageIndices().filter(index=>!remove.has(index));
    const pages=await output.copyPages(source,keep);pages.forEach(page=>output.addPage(page));U().download(await output.save(),`${U().safeName(file.name)}-without-blank.pdf`,'application/pdf');
  };results.appendChild(downloadButton);
}

function normalizeCompare(text,mode){
  const value=String(text??'').normalize('NFKC');return mode==='exact'?value:value.toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/\s+/g,' ').trim();
}

function similarity(a,b){
  if(a===b)return 1;const left=new Set(a.split(/\s+/).filter(Boolean)),right=new Set(b.split(/\s+/).filter(Boolean));
  if(!left.size&&!right.size)return 1;let intersection=0;left.forEach(token=>{if(right.has(token))intersection++});return intersection/(left.size+right.size-intersection||1);
}

async function documentTexts(file){
  const pdf=await loadPdf(file),pages=[];for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){pages.push(await extractPageText(pdf,pageNo))}return pages;
}

async function runCompare(){
  const input=files();if(input.length!==2)throw Error('اختر ملفين PDF للمقارنة');const mode=$('#compareMode')?.value||'normalized';const threshold=Number($('#compareThreshold')?.value||.85);
  setProgress(8,'قراءة الملف الأول');const first=await documentTexts(input[0]);setProgress(48,'قراءة الملف الثاني');const second=await documentTexts(input[1]);
  const total=Math.max(first.length,second.length);const report=[];
  for(let index=0;index<total;index++){
    const left=first[index],right=second[index];let status='متطابقة',score=1;
    if(left===undefined)status='مضافة';else if(right===undefined)status='محذوفة';else{score=similarity(normalizeCompare(left,mode),normalizeCompare(right,mode));if(score<threshold)status='متغيرة'}
    report.push({page:index+1,status,score,left:left||'',right:right||''});
  }
  hideProgress();const results=$('#results');results.innerHTML='';const changed=report.filter(item=>item.status!=='متطابقة');
  const summary=document.createElement('div');summary.className='result';summary.innerHTML=`<b>${changed.length} صفحة مختلفة من ${total}</b><small>${U().escapeHtml(input[0].name)} مقابل ${U().escapeHtml(input[1].name)}</small>`;results.appendChild(summary);
  changed.forEach(item=>{const card=document.createElement('div');card.className='result';card.innerHTML=`<b>الصفحة ${item.page} — ${item.status}</b><small>نسبة التشابه ${(item.score*100).toFixed(1)}%\nالأول: ${U().escapeHtml(item.left.slice(0,220))}\nالثاني: ${U().escapeHtml(item.right.slice(0,220))}</small>`;results.appendChild(card)});
  const exportButton=document.createElement('button');exportButton.className='primary';exportButton.textContent='تنزيل تقرير CSV';exportButton.onclick=()=>{
    const rows=[['الصفحة','الحالة','نسبة التشابه','مقتطف الملف الأول','مقتطف الملف الثاني'],...report.map(item=>[item.page,item.status,(item.score*100).toFixed(2),item.left.slice(0,500),item.right.slice(0,500)])];
    U().download('\ufeff'+rows.map(row=>row.map(U().csvCell).join(',')).join('\n'),'pdf-comparison.csv','text/csv;charset=utf-8');
  };results.appendChild(exportButton);
}

const runners={images:runImages,book:runBook,batch:runBatch,blank:runBlank,compare:runCompare};

function activate(tool){activeTool=tool;setTimeout(()=>optionsFor(tool),0)}

function init(){
  const tools=$('#tools'),run=$('#run');if(!tools||!run)return;
  for(const tool of SUPPORTED){const button=tools.querySelector(`[data-tool="${tool}"]`);if(button)button.addEventListener('click',()=>activate(tool))}
  tools.querySelectorAll('.tool').forEach(button=>button.addEventListener('click',()=>{const tool=button.dataset.tool;if(!SUPPORTED.has(tool))activeTool=''}));
  $('#reset')?.addEventListener('click',()=>{if(activeTool)setTimeout(()=>optionsFor(activeTool),0)});
  run.addEventListener('click',async event=>{
    if(!activeTool||!currentButton())return;event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;await runners[activeTool]()}catch(error){hideProgress();alert(error.message||'تعذر تنفيذ الأداة')}finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();