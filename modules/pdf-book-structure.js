(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;
let active=false;

const MODE_PATTERNS={
  chapter:'(?:الفصل|الباب|chapter)\\s*(?:رقم\\s*)?(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|one|two|three|four|five|six|seven|eight|nine|ten)',
  unit:'(?:الوحدة|unit)\\s*(?:رقم\\s*)?(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|one|two|three|four|five|six|seven|eight|nine|ten)',
  part:'(?:الجزء|القسم|part|section)\\s*(?:رقم\\s*)?(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|الأول|الثاني|الثالث|الرابع|الخامس|one|two|three|four|five)',
  lesson:'(?:الدرس|lesson)\\s*(?:رقم\\s*)?(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|الأول|الثاني|الثالث|الرابع|الخامس|one|two|three|four|five)'
};

function optionsHtml(){
  return `<div class="row">
    <div class="field"><label>التقسيم حسب</label><select id="bookStructureMode">
      <option value="chapter" selected>الفصول — Chapter / الفصل / الباب</option>
      <option value="unit">الوحدات — Unit / الوحدة</option>
      <option value="part">الأجزاء — Part / Section / الجزء</option>
      <option value="lesson">الدروس — Lesson / الدرس</option>
      <option value="custom">كلمات مخصصة</option>
    </select></div>
    <div class="field"><label>كلمات مخصصة</label><input id="bookStructurePattern" type="text" placeholder="مثال: module|appendix|ملحق" disabled></div>
  </div>
  <div class="row">
    <div class="field"><label>أقل مسافة بين بدايتين</label><select id="bookMinGap"><option value="1">صفحة واحدة</option><option value="2" selected>صفحتان</option><option value="3">3 صفحات</option><option value="5">5 صفحات</option></select></div>
    <div class="field"><label>الصفحات التمهيدية</label><select id="bookFrontMatter"><option value="attach" selected>إلحاقها بأول فصل</option><option value="separate">ملف مستقل للمقدمة</option><option value="skip">عدم تضمينها</option></select></div>
  </div>
  <div class="note">يبحث عن بداية الفصل أو الوحدة الصريحة بالعربية والإنجليزية، ولا يعتبر كل عنوان كبير فصلًا؛ لذلك لا يقسم الكتاب صفحةً صفحة.</div>`;
}

function installOptions(){
  if(!active)return;
  const options=$('#options');
  if(!options)return;
  options.classList.remove('hidden');
  options.innerHTML=optionsHtml();
  const mode=$('#bookStructureMode'),custom=$('#bookStructurePattern');
  mode?.addEventListener('change',()=>{custom.disabled=mode.value!=='custom';if(!custom.disabled)custom.focus()});
}

function normalizeTitle(text){
  return U().normalizeDigits(U().clean(text)).toLowerCase().replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

function headingExpression(){
  const mode=$('#bookStructureMode')?.value||'chapter';
  const source=mode==='custom'?($('#bookStructurePattern')?.value||'').trim():MODE_PATTERNS[mode];
  if(!source)throw Error('اكتب كلمات التقسيم المخصصة');
  // Structural headings must begin the row. This rejects prose such as
  // “as explained in Chapter 3” while still accepting “2. Chapter Two”.
  try{return new RegExp(`^(?:[0-9٠-٩۰-۹]+\\s*[.)\\-–—:]\\s*)?(${source})(?:\\s|[:.\\-–—]|$)`,'iu')}catch{throw Error('صيغة كلمات التقسيم غير صحيحة')}
}

function choosePageHeading(rows,expression,pageHeight){
  const matches=[];
  for(const row of rows){
    const text=U().clean(row.text);
    if(text.length<3||text.length>180||!expression.test(text))continue;
    const y=Math.max(...row.items.map(item=>Number(item.transform?.[5]||0)));
    const size=Math.max(...row.items.map(item=>Number(item.height||0)));
    // PDF coordinates start at the bottom. A real chapter heading normally
    // appears in the upper 60% of the page; references inside body text do not.
    if(Number.isFinite(pageHeight)&&pageHeight>0&&y<pageHeight*0.4)continue;
    matches.push({title:text,y,size});
  }
  matches.sort((a,b)=>b.y-a.y||b.size-a.size);
  return matches[0]||null;
}

async function detectStarts(pdf){
  const expression=headingExpression();
  const minimumGap=Math.max(1,Number($('#bookMinGap')?.value||2));
  const starts=[];
  const seenTitles=new Set();
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    U().setProgress(5+(pageNo/pdf.numPages)*80,`فحص بنية الكتاب — الصفحة ${pageNo}`);
    const page=await pdf.getPage(pageNo);
    const rows=U().groupRows((await page.getTextContent()).items,{rtl:'auto'});
    const heading=choosePageHeading(rows,expression,page.getViewport({scale:1}).height);
    if(!heading)continue;
    const key=normalizeTitle(heading.title);
    if(!key||seenTitles.has(key))continue;
    const previous=starts.at(-1);
    if(previous&&pageNo-previous.page<minimumGap)continue;
    seenTitles.add(key);
    starts.push({page:pageNo,title:heading.title});
  }
  return starts;
}

function buildSections(starts,totalPages,frontMatter){
  const sections=starts.map((start,index)=>({...start,end:(starts[index+1]?.page||totalPages+1)-1}));
  if(!sections.length)return sections;
  if(sections[0].page>1){
    if(frontMatter==='attach')sections[0].page=1;
    else if(frontMatter==='separate')sections.unshift({page:1,end:sections[0].page-1,title:'الصفحات التمهيدية — Front matter'});
  }
  return sections.filter(section=>section.end>=section.page);
}

async function sectionBytes(sourceBytes,from,to){
  const source=await PDFLib.PDFDocument.load(sourceBytes.slice(0));
  const output=await PDFLib.PDFDocument.create();
  const indices=[];
  for(let page=from;page<=to;page++)indices.push(page-1);
  (await output.copyPages(source,indices)).forEach(page=>output.addPage(page));
  return output.save();
}

async function runBook(){
  const file=[...($('#files')?.files||[])][0];
  if(!file)throw Error('اختر ملف PDF');
  const sourceBytes=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
  const starts=await detectStarts(pdf);
  U().hideProgress();
  const results=$('#results');results.innerHTML='';
  if(!starts.length){results.innerHTML='<div class="result"><b>لم يتم العثور على بدايات واضحة</b><small>جرّب نوع تقسيم آخر مثل الوحدات أو الأجزاء، أو استخدم كلمات مخصصة.</small></div>';return}
  const mode=$('#bookStructureMode')?.value||'chapter';
  const sections=buildSections(starts,pdf.numPages,$('#bookFrontMatter')?.value||'attach');
  const summary=document.createElement('div');summary.className='result';summary.innerHTML=`<b>تم اكتشاف ${sections.length} قسمًا</b><small>راجع نطاقات الصفحات قبل التنزيل. لم تُستخدم العناوين الكبيرة العامة حتى لا تنقسم كل صفحة منفردة.</small>`;results.appendChild(summary);
  const all=document.createElement('button');all.className='primary';all.textContent='تنزيل جميع الأقسام ZIP';all.onclick=async()=>{
    const zip=new JSZip();
    for(let index=0;index<sections.length;index++){
      const section=sections[index];U().setProgress(5+(index/sections.length)*90,`تجهيز القسم ${index+1}`);
      zip.file(`${String(index+1).padStart(2,'0')}-${U().safeName(section.title).slice(0,70)}.pdf`,await sectionBytes(sourceBytes,section.page,section.end));
    }
    U().download(await zip.generateAsync({type:'blob'}),`${U().safeName(file.name)}-${mode}.zip`,'application/zip');U().hideProgress();
  };results.appendChild(all);
  sections.forEach((section,index)=>{
    const card=document.createElement('div');card.className='result';card.innerHTML=`<b>${U().escapeHtml(section.title)}</b><small>الصفحات ${section.page}–${section.end} — ${section.end-section.page+1} صفحة</small>`;
    card.onclick=async()=>U().download(await sectionBytes(sourceBytes,section.page,section.end),`${String(index+1).padStart(2,'0')}-${U().safeName(section.title)}.pdf`,'application/pdf');results.appendChild(card);
  });
}

function init(){
  const tools=$('#tools'),run=$('#run');if(!tools||!run)return;
  tools.addEventListener('click',event=>{
    const button=event.target.closest('[data-tool]');
    active=button?.dataset.tool==='book';
    if(active)setTimeout(installOptions,20);
  });
  $('#reset')?.addEventListener('click',()=>{if(active)setTimeout(installOptions,20)});
  run.addEventListener('click',async event=>{
    if(!active||!tools.querySelector('[data-tool="book"].active'))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;await runBook()}catch(error){U()?.hideProgress();alert(error.message||'تعذر تقسيم الكتاب')}finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();