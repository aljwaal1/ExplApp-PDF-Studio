(()=>{
'use strict';

let wordMode=false;
const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;

function xmlEscape(value){
  return String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

function isHeading(text,size,baseSize){
  const value=U().clean(text);
  if(!value||value.length>140)return false;
  const arabicKeyword=/^(?:الفصل|الوحدة|الدرس|الباب|المبحث|الموضوع)(?:\s|[:：\-–—]|$)/i.test(value);
  const latinKeyword=/^(?:chapter|unit|lesson|section|part)\b/i.test(value);
  return arabicKeyword||latinKeyword||size>=baseSize*1.45;
}

function paragraphXml(text,{heading=false,pageBreak=false,rtl=false}={}){
  const value=U().clean(text);
  const bidi=rtl?'<w:bidi/><w:jc w:val="right"/>':'';
  const spacing=heading?'<w:spacing w:before="240" w:after="120"/><w:keepNext/>':'';
  const breakBefore=pageBreak?'<w:pageBreakBefore/>':'';
  const rtlRun=rtl?'<w:rtl/>':'';
  const size=heading?30:24;
  const bold=heading?'<w:b/>':'';
  return `<w:p><w:pPr>${bidi}${spacing}${breakBefore}</w:pPr><w:r><w:rPr>${rtlRun}<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}</w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`;
}

async function extractPageRows(pdf,pageNo){
  const page=await pdf.getPage(pageNo);
  const content=await page.getTextContent();
  return U().groupRows(content.items,{rtl:'auto'});
}

function renderOptions(){
  const options=$('#options');
  if(!options)return;
  options.classList.remove('hidden');
  options.innerHTML=`<div class="row"><div class="field"><label>الصفحات</label><input id="wordPages" type="text" placeholder="فارغ = كل الصفحات"></div><div class="field"><label>عناوين الصفحات</label><select id="wordPageLabels"><option value="yes">إظهار رقم كل صفحة</option><option value="no">بدون أرقام صفحات</option></select></div></div><div class="note">ينشئ ملف DOCX حقيقيًا، ويحافظ على اتجاه العربية ويكتشف العناوين تلقائيًا.</div>`;
}

async function buildDocx(){
  if(!window.JSZip)throw Error('مكتبة إنشاء DOCX غير متوفرة');
  const file=$('#files')?.files?.[0];
  if(!file)throw Error('اختر ملف PDF');
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pageIndexes=U().parsePages($('#wordPages')?.value||'',pdf.numPages);
  const showPageLabels=$('#wordPageLabels')?.value!=='no';
  const body=[];

  for(let index=0;index<pageIndexes.length;index++){
    const pageNo=pageIndexes[index]+1;
    U().setProgress(5+(index/pageIndexes.length)*88,`تحويل الصفحة ${pageNo} إلى Word`);
    const rows=await extractPageRows(pdf,pageNo);
    const baseSize=U().median(rows.flatMap(row=>row.items.map(item=>item.height)))||10;
    if(showPageLabels){
      body.push(paragraphXml(`الصفحة ${pageNo}`,{heading:true,pageBreak:index>0,rtl:true}));
    }else if(index>0){
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    if(!rows.length){
      body.push(paragraphXml('[صفحة دون نص قابل للاستخراج]',{rtl:true}));
      continue;
    }
    for(const row of rows){
      const size=Math.max(...row.items.map(item=>item.height));
      body.push(paragraphXml(row.text,{heading:isHeading(row.text,size,baseSize),rtl:row.rtl}));
    }
  }

  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>');
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word').file('document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`);
  zip.folder('word').file('styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:lang w:val="en-US" w:bidi="ar-JO"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>');
  zip.folder('word').folder('_rels').file('document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
  U().download(blob,`${U().safeName(file.name)}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  U().setProgress(100,'تم إنشاء ملف DOCX الحقيقي');
  setTimeout(U().hideProgress,1200);
}

function activate(){
  wordMode=true;
  setTimeout(()=>{
    renderOptions();
    const title=$('#dropTitle'),hint=$('#dropHint');
    if(title)title.textContent='اختر ملف PDF لتحويله إلى Word';
    if(hint)hint.textContent='DOCX حقيقي — عربي وRTL — مع اكتشاف العناوين';
  },0);
}

function init(){
  const tools=$('#tools'),run=$('#run');
  if(!tools||!run)return;
  const button=tools.querySelector('[data-tool="word"]');
  if(!button)return;
  button.addEventListener('click',activate);
  tools.querySelectorAll('.tool:not([data-tool="word"])').forEach(item=>item.addEventListener('click',()=>{wordMode=false}));
  $('#reset')?.addEventListener('click',()=>{if(wordMode)setTimeout(renderOptions,0)});
  run.addEventListener('click',async event=>{
    if(!wordMode||!button.classList.contains('active'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{run.disabled=true;await buildDocx()}
    catch(error){U()?.hideProgress();alert(error.message||'تعذر تحويل PDF إلى Word')}
    finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
