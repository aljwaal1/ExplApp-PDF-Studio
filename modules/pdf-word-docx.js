'use strict';

(function(){
  const xmlEscape=value=>String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');

  const hasArabic=text=>/[\u0600-\u06FF]/.test(text);

  function normalizeLine(text){
    return String(text||'').replace(/\s+/g,' ').trim();
  }

  function paragraphXml(text,{heading=false,pageBreak=false}={}){
    const value=normalizeLine(text);
    const rtl=hasArabic(value);
    const pPr=[];
    if(rtl)pPr.push('<w:bidi/>','<w:jc w:val="right"/>');
    if(heading)pPr.push('<w:spacing w:before="240" w:after="120"/>','<w:keepNext/>');
    if(pageBreak)pPr.push('<w:pageBreakBefore/>');
    const rPr=[];
    if(rtl)rPr.push('<w:rtl/>','<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
    else rPr.push('<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>');
    if(heading)rPr.push('<w:b/>','<w:sz w:val="30"/>','<w:szCs w:val="30"/>');
    else rPr.push('<w:sz w:val="24"/>','<w:szCs w:val="24"/>');
    return `<w:p><w:pPr>${pPr.join('')}</w:pPr><w:r><w:rPr>${rPr.join('')}</w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`;
  }

  function detectHeading(line){
    const text=normalizeLine(line);
    if(!text||text.length>120)return false;
    return /^(الفصل|الوحدة|الدرس|الباب|المبحث|الموضوع|chapter|unit|lesson|section)\b/i.test(text)
      || (/^[A-Z\u0600-\u06FF0-9][^.!?؟]{3,80}$/.test(text) && !/\d{3,}/.test(text));
  }

  async function extractPageLines(pageNo){
    const page=await doc.getPage(pageNo);
    const content=await page.getTextContent();
    const grouped=[];
    const tolerance=4;
    const cells=content.items
      .filter(item=>normalizeLine(item.str))
      .map(item=>({text:normalizeLine(item.str),x:item.transform?.[4]||0,y:item.transform?.[5]||0}))
      .sort((a,b)=>b.y-a.y||a.x-b.x);
    for(const cell of cells){
      let row=grouped.find(candidate=>Math.abs(candidate.y-cell.y)<=tolerance);
      if(!row){row={y:cell.y,cells:[]};grouped.push(row)}
      row.cells.push(cell);
    }
    return grouped
      .sort((a,b)=>b.y-a.y)
      .map(row=>row.cells.sort((a,b)=>a.x-b.x).map(cell=>cell.text).join(' '))
      .map(normalizeLine)
      .filter(Boolean);
  }

  async function buildDocx(){
    if(typeof JSZip==='undefined')throw Error('مكتبة إنشاء DOCX غير متوفرة');
    if(!doc)throw Error('اختر ملف PDF أولاً');
    const body=[];
    for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
      if(typeof prog==='function')prog((pageNo/doc.numPages)*90,`تحويل الصفحة ${pageNo} إلى Word`);
      const lines=await extractPageLines(pageNo);
      if(pageNo>1)body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      if(!lines.length){body.push(paragraphXml(`[صفحة ${pageNo} دون نص قابل للاستخراج]`,{heading:false}));continue}
      for(const line of lines)body.push(paragraphXml(line,{heading:detectHeading(line)}));
    }

    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;

    const zip=new JSZip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.folder('word').file('document.xml',documentXml);
    zip.folder('word').file('styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:lang w:val="en-US" w:bidi="ar-JO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>');
    zip.folder('word').folder('_rels').file('document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
    const name=((files?.[0]?.name||'document').replace(/\.pdf$/i,'')||'document')+'.docx';
    if(typeof dl==='function')dl(blob,name,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    else{
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
    if(typeof prog==='function')prog(100,'تم إنشاء ملف DOCX حقيقي');
    if(typeof hideProg==='function')setTimeout(hideProg,900);
  }

  window.word=buildDocx;
})();
