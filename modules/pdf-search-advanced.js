(()=>{
'use strict';

let searchMode=false;
const $=selector=>document.querySelector(selector);
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

function setProgress(percent,message){
  const box=$('#progress'),bar=$('#bar'),msg=$('#msg');
  if(box)box.style.display='block';
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;
  if(msg)msg.textContent=message||'';
}
function hideProgress(){const box=$('#progress');if(box)box.style.display='none'}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`}
function download(data,name,type){
  const url=URL.createObjectURL(new Blob([data],{type}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function buildMatcher(query,mode,caseSensitive){
  if(!query)throw Error('اكتب كلمة أو عبارة للبحث');
  if(mode==='regex'){
    let expression;
    try{expression=new RegExp(query,caseSensitive?'g':'gi')}catch{throw Error('صيغة Regex غير صحيحة')}
    return text=>{
      expression.lastIndex=0;
      const matches=[...text.matchAll(expression)];
      return matches.map(match=>({index:match.index||0,length:Math.max(1,match[0].length),value:match[0]}));
    };
  }
  const needle=caseSensitive?query:query.toLocaleLowerCase('ar');
  return text=>{
    const source=caseSensitive?text:text.toLocaleLowerCase('ar');
    const found=[];
    let from=0;
    while(from<=source.length){
      const index=source.indexOf(needle,from);
      if(index<0)break;
      found.push({index,length:query.length,value:text.slice(index,index+query.length)});
      from=index+Math.max(1,query.length);
    }
    return found;
  };
}

function snippet(text,index,length){
  const start=Math.max(0,index-80),end=Math.min(text.length,index+length+100);
  return `${start?'…':''}${text.slice(start,index)}[[${text.slice(index,index+length)}]]${text.slice(index+length,end)}${end<text.length?'…':''}`;
}

async function searchFiles(files,matcher){
  const results=[];
  let completedPages=0,totalPages=0;
  const docs=[];
  for(const file of files){
    const data=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data}).promise;
    docs.push({file,data,pdf});totalPages+=pdf.numPages;
  }
  for(const entry of docs){
    for(let pageNo=1;pageNo<=entry.pdf.numPages;pageNo++){
      completedPages++;
      setProgress(5+(completedPages/Math.max(1,totalPages))*85,`البحث في ${entry.file.name} — الصفحة ${pageNo}`);
      const page=await entry.pdf.getPage(pageNo);
      const content=await page.getTextContent();
      const text=clean(content.items.map(item=>item.str||'').join(' '));
      const matches=matcher(text);
      matches.forEach((match,occurrence)=>results.push({
        file:entry.file,
        fileName:entry.file.name,
        page:pageNo,
        occurrence:occurrence+1,
        matched:match.value,
        snippet:snippet(text,match.index,match.length)
      }));
    }
  }
  return results;
}

async function previewResult(result){
  document.querySelector('.search-preview-overlay')?.remove();
  const overlay=document.createElement('div');overlay.className='search-preview-overlay';
  overlay.innerHTML='<section><header><strong></strong><button type="button">إغلاق</button></header><div class="search-preview-body"><canvas></canvas></div></section>';
  overlay.querySelector('strong').textContent=`${result.fileName} — الصفحة ${result.page}`;
  overlay.querySelector('button').onclick=()=>overlay.remove();
  overlay.onclick=event=>{if(event.target===overlay)overlay.remove()};
  document.body.appendChild(overlay);
  const data=await result.file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const page=await pdf.getPage(result.page);
  const viewport=page.getViewport({scale:1.45});
  const canvas=overlay.querySelector('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
}

function addStyles(){
  if($('#searchAdvancedStyles'))return;
  const style=document.createElement('style');style.id='searchAdvancedStyles';style.textContent=`
  .search-summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border:1px solid var(--l);border-radius:12px;background:#f8faff}
  .search-summary button{margin-inline-start:auto}.search-result-card{cursor:pointer}.search-result-card mark{background:#ffe58f;padding:0 3px;border-radius:4px}.search-result-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--m);font-size:11px;margin-bottom:5px}
  .search-preview-overlay{position:fixed;inset:0;z-index:1200;background:#101828bb;display:flex;align-items:center;justify-content:center;padding:14px}.search-preview-overlay section{width:min(900px,100%);max-height:95vh;background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden}.search-preview-overlay header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--l)}.search-preview-body{overflow:auto;padding:12px;text-align:center}.search-preview-body canvas{max-width:100%;border:1px solid var(--l)}
  @media(max-width:620px){.search-preview-overlay{padding:0}.search-preview-overlay section{height:100vh;max-height:none;border-radius:0}.search-summary button{width:100%;margin:0}}
  `;document.head.appendChild(style);
}

function highlightedSnippet(value){
  const safe=escapeHtml(value);
  return safe.replace(/\[\[(.*?)\]\]/g,'<mark>$1</mark>');
}

function renderResults(results){
  const out=$('#results');if(!out)return;
  out.innerHTML='';
  const summary=document.createElement('div');summary.className='search-summary';
  const label=document.createElement('strong');label.textContent=`تم العثور على ${results.length} نتيجة`;
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='primary';exportButton.textContent='تصدير النتائج CSV';
  exportButton.disabled=!results.length;
  exportButton.onclick=()=>{
    const rows=[['الملف','الصفحة','التكرار','النص المطابق','المقتطف'],...results.map(item=>[item.fileName,item.page,item.occurrence,item.matched,item.snippet.replace(/\[\[|\]\]/g,'')])];
    download('\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'pdf-search-results.csv','text/csv;charset=utf-8');
  };
  summary.append(label,exportButton);out.appendChild(summary);
  results.forEach(result=>{
    const card=document.createElement('article');card.className='result search-result-card';
    card.innerHTML=`<div class="search-result-meta"><span>${escapeHtml(result.fileName)}</span><span>الصفحة ${result.page}</span><span>التكرار ${result.occurrence}</span></div><small>${highlightedSnippet(result.snippet)}</small>`;
    card.onclick=()=>previewResult(result).catch(error=>alert(error.message||'تعذر عرض الصفحة'));
    out.appendChild(card);
  });
}

async function runSearch(){
  const files=[...($('#files')?.files||[])].filter(file=>file.name.toLowerCase().endsWith('.pdf'));
  if(!files.length)throw Error('اختر ملف PDF واحدًا أو أكثر');
  const query=clean($('#searchAdvancedQuery')?.value);
  const mode=$('#searchAdvancedMode')?.value||'text';
  const caseSensitive=$('#searchAdvancedCase')?.value==='yes';
  const matcher=buildMatcher(query,mode,caseSensitive);
  const results=await searchFiles(files,matcher);
  renderResults(results);
  setProgress(100,`اكتمل البحث: ${results.length} نتيجة`);
  setTimeout(hideProgress,1200);
}

function renderOptions(){
  const options=$('#options');if(!options)return;
  options.innerHTML=`<div class="row"><div class="field"><label>الكلمة أو العبارة</label><input id="searchAdvancedQuery" type="text" placeholder="اكتب ما تريد البحث عنه"></div><div class="field"><label>نوع البحث</label><select id="searchAdvancedMode"><option value="text">بحث عادي</option><option value="regex">Regex متقدم</option></select></div><div class="field"><label>حالة الأحرف</label><select id="searchAdvancedCase"><option value="no">تجاهل حالة الأحرف</option><option value="yes">مطابقة الحالة</option></select></div></div><div class="note">يمكن اختيار عدة ملفات PDF، ثم فتح صفحة كل نتيجة أو تصدير جميع النتائج إلى CSV.</div>`;
}

function activate(){
  searchMode=true;
  setTimeout(()=>{
    const files=$('#files');if(files)files.multiple=true;
    renderOptions();
    const title=$('#dropTitle'),hint=$('#dropHint');
    if(title)title.textContent='اختر ملف PDF واحدًا أو أكثر للبحث';
    if(hint)hint.textContent='بحث عادي أو Regex — مع معاينة وتصدير النتائج';
  },0);
}

function init(){
  addStyles();
  const tools=$('#tools'),run=$('#run');if(!tools||!run)return;
  const button=tools.querySelector('[data-tool="search"]');if(!button)return;
  button.addEventListener('click',activate);
  tools.querySelectorAll('.tool:not([data-tool="search"])').forEach(item=>item.addEventListener('click',()=>{searchMode=false}));
  run.addEventListener('click',async event=>{
    if(!searchMode&&!tools.querySelector('[data-tool="search"].active'))return;
    searchMode=true;event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;await runSearch()}
    catch(error){hideProgress();alert(error.message||'تعذر البحث داخل PDF')}
    finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
