(()=>{
'use strict';
let htmlMode=false;

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const safeName=name=>String(name||'document').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');
const hasArabic=text=>/[\u0600-\u06FF]/.test(text);

function groupLines(items){
  const normalized=items.filter(item=>String(item.str||'').trim()).map(item=>({
    text:String(item.str||'').trim(),
    x:item.transform?.[4]||0,
    y:item.transform?.[5]||0,
    size:Math.max(8,Math.abs(item.height||item.transform?.[0]||10))
  })).sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const item of normalized){
    let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=Math.max(3,item.size*.32));
    if(!line){line={y:item.y,size:item.size,items:[]};lines.push(line)}
    line.size=Math.max(line.size,item.size);
    line.items.push(item);
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>{
    const rtl=hasArabic(line.items.map(item=>item.text).join(' '));
    const ordered=[...line.items].sort((a,b)=>rtl?b.x-a.x:a.x-b.x);
    return {text:ordered.map(item=>item.text).join(' ').replace(/\s+/g,' ').trim(),size:line.size,rtl};
  });
}

function isHeading(line,median){
  if(!line.text||line.text.length>140)return false;
  return line.size>=median*1.28||/^(?:الفصل|الوحدة|الباب|الدرس|chapter|unit|section)\b/i.test(line.text);
}

async function extractPages(pdf){
  const pages=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const lines=groupLines(content.items);
    const sizes=lines.map(line=>line.size).sort((a,b)=>a-b);
    const median=sizes.length?sizes[Math.floor(sizes.length/2)]:10;
    pages.push({pageNo,lines,median});
    const progress=document.querySelector('#progress');
    if(progress)progress.style.display='block';
    const bar=document.querySelector('#bar');if(bar)bar.style.width=`${Math.round(pageNo/pdf.numPages*92)}%`;
    const msg=document.querySelector('#msg');if(msg)msg.textContent=`تحويل الصفحة ${pageNo} من ${pdf.numPages}`;
  }
  return pages;
}

function buildHtml(pages,title,{pageNumbers=true,sourceName='' }={}){
  const body=pages.map(({pageNo,lines,median})=>{
    const content=lines.map(line=>{
      const dir=line.rtl?'rtl':'ltr';
      if(isHeading(line,median))return `<h2 dir="${dir}">${escapeHtml(line.text)}</h2>`;
      return `<p dir="${dir}">${escapeHtml(line.text)}</p>`;
    }).join('\n');
    return `<section class="pdf-page" id="page-${pageNo}">${pageNumbers?`<div class="page-number">الصفحة ${pageNo}</div>`:''}${content||'<p class="empty">صفحة بلا نص قابل للاستخراج</p>'}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#dbe3ef;--paper:#fff;--bg:#f4f7fb;--accent:#2859d8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Tahoma,Arial,sans-serif;line-height:1.85}
main{max-width:900px;margin:auto;padding:24px}.document-title{background:linear-gradient(135deg,#2859d8,#6887ec);color:#fff;padding:24px;border-radius:20px;margin-bottom:18px}
.document-title h1{margin:0 0 6px;font-size:26px}.document-title small{opacity:.85}.pdf-page{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:42px 34px 30px;margin:0 0 18px;box-shadow:0 8px 24px #1d293912}
.page-number{position:absolute;top:12px;inset-inline-end:18px;color:var(--muted);font-size:12px}h2{color:var(--accent);margin:20px 0 10px;line-height:1.45}p{margin:0 0 10px;white-space:pre-wrap}.empty{color:var(--muted);font-style:italic}
@media(max-width:620px){main{padding:10px}.document-title{padding:18px;border-radius:14px}.pdf-page{padding:38px 16px 22px;border-radius:14px}}
@media print{body{background:#fff}main{max-width:none;padding:0}.document-title{display:none}.pdf-page{border:0;box-shadow:none;border-radius:0;break-after:page;margin:0;padding:20mm 15mm}.page-number{top:5mm}}
</style>
</head>
<body><main><header class="document-title"><h1>${escapeHtml(title)}</h1><small>تم التحويل من ${escapeHtml(sourceName)}</small></header>${body}</main></body></html>`;
}

function downloadHtml(content,name){
  const blob=new Blob(['\ufeff',content],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`${safeName(name)}.html`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function addOptions(){
  if(document.querySelector('#htmlExportOptions'))return;
  const run=document.querySelector('#run');if(!run)return;
  const box=document.createElement('div');box.id='htmlExportOptions';box.className='hidden';
  box.innerHTML='<div class="row"><div class="field"><label>عنوان المستند</label><input id="htmlTitle" type="text" placeholder="يؤخذ من اسم الملف تلقائيًا"></div><div class="field"><label>ترقيم الصفحات</label><select id="htmlPageNumbers"><option value="yes">إظهار</option><option value="no">إخفاء</option></select></div></div><div class="note">ينتج ملف HTML واحدًا متجاوبًا، يدعم العربية والطباعة ويمكن فتحه دون إنترنت.</div>';
  run.parentElement.insertAdjacentElement('beforebegin',box);
}

async function convert(){
  const file=document.querySelector('#files')?.files?.[0];
  if(!file)throw Error('اختر ملف PDF');
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pages=await extractPages(pdf);
  const title=document.querySelector('#htmlTitle')?.value.trim()||safeName(file.name);
  const pageNumbers=document.querySelector('#htmlPageNumbers')?.value!=='no';
  downloadHtml(buildHtml(pages,title,{pageNumbers,sourceName:file.name}),file.name);
  const bar=document.querySelector('#bar');if(bar)bar.style.width='100%';
  const msg=document.querySelector('#msg');if(msg)msg.textContent=`تم إنشاء HTML من ${pdf.numPages} صفحة`;
}

function init(){
  const tools=document.querySelector('.tools');if(!tools)return;
  addOptions();
  if(tools.querySelector('[data-html-entry="true"]'))return;
  const markdownButton=tools.querySelector('[data-tool="md"]');
  const button=document.createElement('button');button.type='button';button.className='tool';button.dataset.htmlEntry='true';
  button.innerHTML='<b>🌐 PDF إلى HTML</b><span>عربي ومتجاوب وجاهز للنشر</span>';
  button.onclick=()=>{
    htmlMode=true;
    document.querySelectorAll('.tool').forEach(item=>item.classList.remove('active'));button.classList.add('active');
    document.querySelector('#htmlExportOptions')?.classList.remove('hidden');
    const fileInput=document.querySelector('#files');if(fileInput){fileInput.accept='application/pdf';fileInput.multiple=false}
    const title=document.querySelector('#dropTitle');if(title)title.textContent='اختر ملف PDF لتحويله إلى HTML';
    const hint=document.querySelector('#dropHint');if(hint)hint.textContent='ملف HTML واحد مع دعم العربية وRTL';
  };
  if(markdownButton?.nextSibling)tools.insertBefore(button,markdownButton.nextSibling);else tools.appendChild(button);
  tools.querySelectorAll('.tool:not([data-html-entry="true"])').forEach(other=>other.addEventListener('click',()=>{
    htmlMode=false;document.querySelector('#htmlExportOptions')?.classList.add('hidden');
  }));
  document.querySelector('#run')?.addEventListener('click',async event=>{
    if(!htmlMode)return;event.preventDefault();event.stopImmediatePropagation();
    const run=event.currentTarget;try{run.disabled=true;await convert()}catch(error){alert(error.message||'تعذر تحويل PDF إلى HTML')}finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();