(()=>{
'use strict';

const TOOL_ID='md';
let markdownMode=false;

const $=selector=>document.querySelector(selector);
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const safeName=name=>String(name||'document.pdf').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');
const arabicCount=text=>(String(text).match(/[\u0600-\u06FF]/g)||[]).length;
const latinCount=text=>(String(text).match(/[A-Za-z]/g)||[]).length;

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
  const url=URL.createObjectURL(new Blob([data],{type}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function median(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return 10;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function groupLines(items){
  const normalized=items.map(item=>({
    text:clean(item.str),
    x:Number(item.transform?.[4]||0),
    y:Number(item.transform?.[5]||0),
    size:Math.max(1,Math.abs(item.height||item.transform?.[0]||10)),
    width:Number(item.width||0)
  })).filter(item=>item.text);
  normalized.sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const item of normalized){
    const tolerance=Math.max(3,item.size*.35);
    let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=tolerance);
    if(!line){line={y:item.y,items:[]};lines.push(line)}
    line.items.push(item);
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>{
    const raw=line.items.map(item=>item.text).join(' ');
    const rtl=arabicCount(raw)>latinCount(raw);
    const ordered=[...line.items].sort((a,b)=>rtl?b.x-a.x:a.x-b.x);
    return {
      text:clean(ordered.map(item=>item.text).join(' ')),
      size:Math.max(...ordered.map(item=>item.size)),
      rtl
    };
  }).filter(line=>line.text);
}

function escapeMarkdown(text){
  return clean(text).replace(/([\\`*_{}\[\]<>])/g,'\\$1');
}

function normalizeList(text){
  const bullet=text.match(/^\s*[•·▪◦‣–—-]\s*(.+)$/);
  if(bullet)return`- ${escapeMarkdown(bullet[1])}`;
  const numbered=text.match(/^\s*([0-9٠-٩۰-۹]+)[.)-]\s*(.+)$/);
  if(numbered)return`${numbered[1]}. ${escapeMarkdown(numbered[2])}`;
  return'';
}

function headingLevel(line,baseSize){
  const text=line.text;
  if(text.length>160)return 0;
  if(/^(الفصل|الوحدة|الباب|القسم|الدرس|chapter|unit|section|part)\b/i.test(text))return 2;
  if(line.size>=baseSize*1.9)return 1;
  if(line.size>=baseSize*1.55)return 2;
  if(line.size>=baseSize*1.3&&text.length<=110)return 3;
  return 0;
}

function pageToMarkdown(lines,pageNo,{pageHeadings=true}={}){
  const baseSize=median(lines.map(line=>line.size));
  const blocks=[];
  let paragraph=[];
  const flush=()=>{
    if(!paragraph.length)return;
    blocks.push(paragraph.join(' ').replace(/\s+/g,' ').trim());
    paragraph=[];
  };
  if(pageHeadings)blocks.push(`## الصفحة ${pageNo}`);
  for(const line of lines){
    const list=normalizeList(line.text);
    const level=headingLevel(line,baseSize);
    if(level){
      flush();
      blocks.push(`${'#'.repeat(level)} ${escapeMarkdown(line.text)}`);
      continue;
    }
    if(list){
      flush();
      blocks.push(list);
      continue;
    }
    const text=escapeMarkdown(line.text);
    if(!text)continue;
    const ends=/[.!؟?:؛،]$/.test(text);
    paragraph.push(text);
    if(ends||paragraph.join(' ').length>650)flush();
  }
  flush();
  return blocks.join('\n\n').trim();
}

async function extractPages(pdf,options){
  const pages=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    setProgress(5+(pageNo/pdf.numPages)*82,`تحويل الصفحة ${pageNo} من ${pdf.numPages} إلى Markdown`);
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    pages.push(pageToMarkdown(groupLines(content.items),pageNo,options));
  }
  return pages;
}

function yamlFrontMatter(fileName,pageCount){
  const title=safeName(fileName).replace(/"/g,'\\"');
  return `---\ntitle: "${title}"\nlanguage: ar\ndirection: rtl\npages: ${pageCount}\n---\n\n`;
}

async function runMarkdown(){
  const file=$('#files')?.files?.[0];
  if(!file)throw Error('اختر ملف PDF');
  const mode=$('#mdOutputMode')?.value||'single';
  const pageHeadings=$('#mdPageHeadings')?.value!=='no';
  const frontMatter=$('#mdFrontMatter')?.value==='yes';
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pages=await extractPages(pdf,{pageHeadings});
  const base=safeName(file.name);
  if(mode==='pages'){
    if(!window.JSZip)throw Error('مكتبة ZIP غير متوفرة');
    const zip=new JSZip();
    pages.forEach((content,index)=>zip.file(`${base}-page-${String(index+1).padStart(3,'0')}.md`,content+'\n'));
    zip.file('README.md',`# ${base}\n\nتم إنشاء ${pages.length} ملف Markdown، ملف لكل صفحة.\n`);
    setProgress(92,'إنشاء ملف ZIP…');
    const blob=await zip.generateAsync({type:'blob'});
    download(blob,`${base}-markdown-pages.zip`,'application/zip');
  }else{
    const separator='\n\n---\n\n';
    const prefix=frontMatter?yamlFrontMatter(file.name,pdf.numPages):'';
    download(prefix+pages.join(separator)+'\n',`${base}.md`,'text/markdown;charset=utf-8');
  }
  setProgress(100,'تم إنشاء Markdown بنجاح');
  setTimeout(hideProgress,1200);
}

function renderOptions(){
  const options=$('#options');
  if(!options)return;
  options.innerHTML=`<div class="row"><div class="field"><label>صيغة الإخراج</label><select id="mdOutputMode"><option value="single">ملف Markdown واحد</option><option value="pages">ملف لكل صفحة داخل ZIP</option></select></div><div class="field"><label>عناوين الصفحات</label><select id="mdPageHeadings"><option value="yes">إظهار رقم كل صفحة</option><option value="no">بدون عناوين صفحات</option></select></div><div class="field"><label>بيانات YAML</label><select id="mdFrontMatter"><option value="no">بدون</option><option value="yes">إضافة Front Matter</option></select></div></div><div class="note">يكتشف العناوين والقوائم تلقائيًا، ويحافظ على العربية واتجاه النص عند استخدام الملف في GitHub وObsidian وNotion.</div>`;
}

function activate(){
  markdownMode=true;
  setTimeout(()=>{
    renderOptions();
    const title=$('#dropTitle'),hint=$('#dropHint');
    if(title)title.textContent='اختر ملف PDF لتحويله إلى Markdown';
    if(hint)hint.textContent='عربي وإنجليزي — ملف واحد أو ملفات صفحات داخل ZIP';
  },0);
}

function init(){
  const tools=$('#tools');
  const run=$('#run');
  if(!tools||!run)return;
  const mdButton=tools.querySelector('[data-tool="md"]');
  if(!mdButton)return;
  mdButton.addEventListener('click',activate);
  tools.querySelectorAll('.tool:not([data-tool="md"])').forEach(button=>button.addEventListener('click',()=>{markdownMode=false}));
  run.addEventListener('click',async event=>{
    if(!markdownMode&&!tools.querySelector('[data-tool="md"].active'))return;
    markdownMode=true;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{
      run.disabled=true;
      await runMarkdown();
    }catch(error){
      hideProgress();
      alert(error.message||'تعذر تحويل PDF إلى Markdown');
    }finally{
      run.disabled=false;
    }
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
