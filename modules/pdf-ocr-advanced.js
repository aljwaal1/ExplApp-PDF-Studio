(()=>{
'use strict';

let ocrMode=false;
let cancelled=false;
const $=selector=>document.querySelector(selector);
const clean=value=>String(value??'').replace(/\r/g,'').trim();
const safeName=name=>String(name||'document.pdf').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');

function setProgress(percent,message){
  const box=$('#progress'),bar=$('#bar'),msg=$('#msg');
  if(box)box.style.display='block';
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;
  if(msg)msg.textContent=message||'';
}

function hideProgress(){
  const box=$('#progress');
  if(box)box.style.display='none';
}

function download(data,name,type){
  const blob=data instanceof Blob?data:new Blob([data],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function normalizeDigits(value){
  return String(value||'')
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[،؛]/g,',');
}

function parsePages(value,total){
  const input=normalizeDigits(value).trim();
  if(!input)return Array.from({length:total},(_,index)=>index+1);
  const pages=[];
  for(const part of input.split(',')){
    const token=part.trim();
    if(!token)continue;
    if(token.includes('-')){
      const [fromRaw,toRaw]=token.split('-');
      const from=Number(fromRaw),to=Number(toRaw);
      if(!Number.isInteger(from)||!Number.isInteger(to))throw Error('صيغة الصفحات غير صحيحة');
      const step=from<=to?1:-1;
      for(let page=from;step>0?page<=to:page>=to;page+=step){
        if(page>=1&&page<=total)pages.push(page);
      }
    }else{
      const page=Number(token);
      if(Number.isInteger(page)&&page>=1&&page<=total)pages.push(page);
    }
  }
  const unique=[...new Set(pages)];
  if(!unique.length)throw Error('لا توجد صفحات صالحة');
  return unique;
}

function applyPreprocessing(canvas,mode,contrastValue){
  if(mode==='none')return canvas;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  const data=image.data;
  const contrast=Math.max(-100,Math.min(100,Number(contrastValue)||0));
  const factor=(259*(contrast+255))/(255*(259-contrast));
  for(let index=0;index<data.length;index+=4){
    const gray=Math.round(data[index]*.299+data[index+1]*.587+data[index+2]*.114);
    let value=Math.max(0,Math.min(255,factor*(gray-128)+128));
    if(mode==='binary')value=value>=165?255:0;
    data[index]=data[index+1]=data[index+2]=value;
  }
  context.putImageData(image,0,0);
  return canvas;
}

async function renderPage(page,scale,preprocess,contrast,rotation){
  const baseViewport=page.getViewport({scale,rotation});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(baseViewport.width);
  canvas.height=Math.ceil(baseViewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport:baseViewport}).promise;
  return applyPreprocessing(canvas,preprocess,contrast);
}

async function nativePageText(page){
  const content=await page.getTextContent();
  return clean(content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' '));
}

function xmlEscape(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
  }[char]));
}

function paragraphXml(text,{heading=false,pageBreak=false}={}){
  const cleanText=xmlEscape(text);
  const pPr=`<w:pPr><w:bidi/><w:jc w:val="right"/>${pageBreak?'<w:pageBreakBefore/>':''}</w:pPr>`;
  const rPr=`<w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${heading?30:24}"/>${heading?'<w:b/>':''}</w:rPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${cleanText}</w:t></w:r></w:p>`;
}

async function createDocx(pages,title){
  if(!window.JSZip)throw Error('مكتبة ZIP غير متوفرة');
  const zip=new JSZip();
  zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word').file('styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`);
  const body=[paragraphXml(title,{heading:true})];
  pages.forEach((entry,index)=>{
    body.push(paragraphXml(`الصفحة ${entry.page}`,{heading:true,pageBreak:index>0}));
    const paragraphs=clean(entry.text).split(/\n{2,}/).map(clean).filter(Boolean);
    if(paragraphs.length)paragraphs.forEach(text=>body.push(paragraphXml(text)));
    else body.push(paragraphXml('لم يتم استخراج نص من هذه الصفحة.'));
  });
  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>');
  zip.folder('word').file('document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

function outputText(pages,format,title){
  if(format==='md'){
    return `# ${title}\n\n`+pages.map(entry=>`## الصفحة ${entry.page}\n\n${entry.text||'_لم يتم استخراج نص من هذه الصفحة._'}`).join('\n\n---\n\n')+'\n';
  }
  return '\ufeff'+pages.map(entry=>`--- الصفحة ${entry.page} ---\n${entry.text||'لم يتم استخراج نص من هذه الصفحة.'}`).join('\n\n');
}

async function runOcr(){
  const file=$('#files')?.files?.[0];
  if(!file)throw Error('اختر ملف PDF');
  if(!window.Tesseract)throw Error('مكتبة OCR غير متوفرة');
  cancelled=false;
  const language=$('#ocrLang')?.value||'ara+eng';
  const output=$('#ocrOutput')?.value||'txt';
  const pageMode=$('#ocrPageMode')?.value||'auto';
  const preprocess=$('#ocrPreprocess')?.value||'gray';
  const scale=Math.max(1.5,Math.min(3,Number($('#ocrScale')?.value)||2.2));
  const contrast=Number($('#ocrContrast')?.value)||20;
  const rotation=Number($('#ocrRotation')?.value)||0;
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pageNumbers=parsePages($('#ocrPagesAdvanced')?.value,pdf.numPages);
  const worker=await Tesseract.createWorker(language,1,{
    logger:message=>{
      if(message.status==='recognizing text'&&Number.isFinite(message.progress)){
        const current=Number($('#ocrCurrentIndex')?.value)||0;
        const overall=((current+message.progress)/pageNumbers.length)*90;
        setProgress(overall,`OCR: ${Math.round(message.progress*100)}%`);
      }
    }
  });
  const results=[];
  try{
    for(let index=0;index<pageNumbers.length;index++){
      if(cancelled)throw Error('تم إلغاء العملية');
      const pageNumber=pageNumbers[index];
      const hidden=$('#ocrCurrentIndex');
      if(hidden)hidden.value=String(index);
      const page=await pdf.getPage(pageNumber);
      const nativeText=await nativePageText(page);
      if(pageMode==='auto'&&nativeText.length>=40){
        results.push({page:pageNumber,text:nativeText,source:'native'});
        setProgress(((index+1)/pageNumbers.length)*90,`استخدم النص الأصلي للصفحة ${pageNumber}`);
        continue;
      }
      const canvas=await renderPage(page,scale,preprocess,contrast,rotation);
      setProgress((index/pageNumbers.length)*90,`قراءة الصفحة ${pageNumber} بالعربية…`);
      const recognized=await worker.recognize(canvas);
      results.push({page:pageNumber,text:clean(recognized.data.text),source:'ocr'});
    }
  }finally{
    await worker.terminate();
  }
  const base=safeName(file.name);
  setProgress(94,'تجهيز ملف الإخراج…');
  if(output==='docx'){
    const blob=await createDocx(results,base);
    download(blob,`${base}-ocr.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }else if(output==='md'){
    download(outputText(results,'md',base),`${base}-ocr.md`,'text/markdown;charset=utf-8');
  }else{
    download(outputText(results,'txt',base),`${base}-ocr.txt`,'text/plain;charset=utf-8');
  }
  const nativeCount=results.filter(item=>item.source==='native').length;
  const ocrCount=results.length-nativeCount;
  setProgress(100,`تم: ${ocrCount} صفحة OCR و${nativeCount} صفحة نص أصلي`);
  setTimeout(hideProgress,1800);
}

function renderOptions(){
  const options=$('#options');
  if(!options)return;
  options.innerHTML=`<input id="ocrCurrentIndex" type="hidden" value="0"><div class="row"><div class="field"><label>اللغة</label><select id="ocrLang"><option value="ara+eng">عربي وإنجليزي</option><option value="ara">عربي</option><option value="eng">إنجليزي</option></select></div><div class="field"><label>الصفحات</label><input id="ocrPagesAdvanced" type="text" placeholder="فارغ = كل الصفحات"></div><div class="field"><label>الإخراج</label><select id="ocrOutput"><option value="txt">TXT</option><option value="md">Markdown</option><option value="docx">Word DOCX</option></select></div></div><div class="row"><div class="field"><label>طريقة القراءة</label><select id="ocrPageMode"><option value="auto">تلقائي: استخدم النص الأصلي إن وُجد</option><option value="all">OCR لكل الصفحات</option></select></div><div class="field"><label>تحسين الصورة</label><select id="ocrPreprocess"><option value="gray">تدرج رمادي وتباين</option><option value="binary">أبيض وأسود قوي</option><option value="none">بدون تحسين</option></select></div><div class="field"><label>الدقة</label><select id="ocrScale"><option value="1.8">سريعة</option><option value="2.2" selected>متوازنة</option><option value="2.8">دقيقة</option></select></div></div><div class="row"><div class="field"><label>التباين</label><select id="ocrContrast"><option value="0">طبيعي</option><option value="20" selected>متوسط</option><option value="40">مرتفع</option></select></div><div class="field"><label>تدوير الصفحات قبل القراءة</label><select id="ocrRotation"><option value="0">بدون</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div><button id="ocrCancel" type="button" class="danger">إلغاء العملية</button></div><div class="note warn">يعمل OCR محليًا في المتصفح بعد تنزيل ملفات اللغة أول مرة. الوضع التلقائي يتجنب إعادة قراءة الصفحات التي تحتوي نصًا أصليًا.</div>`;
  $('#ocrCancel')?.addEventListener('click',()=>{cancelled=true;setProgress(0,'جارٍ إلغاء العملية…')});
}

function activate(){
  ocrMode=true;
  setTimeout(()=>{
    renderOptions();
    const title=$('#dropTitle'),hint=$('#dropHint');
    if(title)title.textContent='اختر ملف PDF لاستخراج النص بـ OCR';
    if(hint)hint.textContent='عربي وإنجليزي — TXT أو Markdown أو Word DOCX';
  },0);
}

function init(){
  const tools=$('#tools'),run=$('#run');
  if(!tools||!run)return;
  const button=tools.querySelector('[data-tool="ocr"]');
  if(!button)return;
  button.addEventListener('click',activate);
  tools.querySelectorAll('.tool:not([data-tool="ocr"])').forEach(item=>item.addEventListener('click',()=>{ocrMode=false;cancelled=false}));
  run.addEventListener('click',async event=>{
    if(!ocrMode&&!tools.querySelector('[data-tool="ocr"].active'))return;
    ocrMode=true;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{
      run.disabled=true;
      await runOcr();
    }catch(error){
      hideProgress();
      if(error.message!=='تم إلغاء العملية')alert(error.message||'تعذر تنفيذ OCR');
    }finally{
      run.disabled=false;
      cancelled=false;
    }
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
