(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;
let active=false;
let currentState=null;

const LEVELS={unit:1,part:1,chapter:2,lesson:3,custom:2};
const TYPE_LABELS={unit:'وحدة',part:'جزء / قسم',chapter:'فصل',lesson:'درس',custom:'قسم'};
const TYPE_ICONS={unit:'📂',part:'🗂️',chapter:'📘',lesson:'📄',custom:'🔖'};
const NUMBER_TOKEN='(?:[0-9٠-٩۰-۹]+|[IVXLCDM]+|الأول|الأولى|الثاني|الثانية|الثالث|الثالثة|الرابع|الرابعة|الخامس|الخامسة|السادس|السادسة|السابع|السابعة|الثامن|الثامنة|التاسع|التاسعة|العاشر|العاشرة|one|two|three|four|five|six|seven|eight|nine|ten)';
const TYPE_SOURCES={
  unit:`(?:الوحدة|unit)\\s*(?:رقم\\s*)?${NUMBER_TOKEN}`,
  part:`(?:الجزء|القسم|part|section)\\s*(?:رقم\\s*)?${NUMBER_TOKEN}`,
  chapter:`(?:الفصل|الباب|chapter)\\s*(?:رقم\\s*)?${NUMBER_TOKEN}`,
  lesson:`(?:الدرس|lesson)\\s*(?:رقم\\s*)?${NUMBER_TOKEN}`
};

function optionsHtml(){
  return `<div class="row">
    <div class="field"><label>طريقة اكتشاف بنية الكتاب</label><select id="bookStructureMode">
      <option value="auto" selected>تلقائي — وحدة ← فصل ← درس</option>
      <option value="unit">الوحدات فقط — Unit / الوحدة</option>
      <option value="chapter">الفصول فقط — Chapter / الفصل / الباب</option>
      <option value="lesson">الدروس فقط — Lesson / الدرس</option>
      <option value="part">الأجزاء / الأقسام — Part / Section</option>
      <option value="custom">كلمات مخصصة</option>
    </select></div>
    <div class="field"><label>كلمات مخصصة</label><input id="bookStructurePattern" type="text" placeholder="مثال: module|appendix|ملحق" disabled></div>
  </div>
  <div class="row">
    <div class="field"><label>أقل مسافة بين عنوانين من النوع نفسه</label><select id="bookMinGap"><option value="1">صفحة واحدة</option><option value="2" selected>صفحتان</option><option value="3">3 صفحات</option><option value="5">5 صفحات</option></select></div>
    <div class="field"><label>الصفحات التمهيدية</label><select id="bookFrontMatter"><option value="keep" selected>إبقاؤها خارج الهيكل</option><option value="attach">إلحاقها بأول قسم رئيسي</option><option value="separate">إظهارها كقسم مستقل</option></select></div>
  </div>
  <div class="note">يفحص موضع العنوان وحجمه وتسلسله، ويتجاهل إشارات مثل “راجع Chapter 3” وفهارس المحتويات قدر الإمكان. نهاية كل قسم تُستنتج من بداية القسم التالي على المستوى نفسه أو الأعلى.</div>`;
}

function installOptions(){
  if(!active)return;
  const options=$('#options');
  if(!options)return;
  options.classList.remove('hidden');
  options.innerHTML=optionsHtml();
  const mode=$('#bookStructureMode'),custom=$('#bookStructurePattern');
  mode?.addEventListener('change',()=>{
    custom.disabled=mode.value!=='custom';
    if(!custom.disabled)custom.focus();
  });
}

function normalizeTitle(text){
  return U().normalizeDigits(U().clean(text)).toLowerCase()
    .replace(/[\u200e\u200f\u202a-\u202e]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

function anchoredExpression(source){
  return new RegExp(`^(?:[0-9٠-٩۰-۹]+\\s*[.)\\-–—:]\\s*)?(${source})(?:\\s|[:.\\-–—]|$)`,'iu');
}

function detectionExpressions(){
  const mode=$('#bookStructureMode')?.value||'auto';
  if(mode==='custom'){
    const source=($('#bookStructurePattern')?.value||'').trim();
    if(!source)throw Error('اكتب كلمات التقسيم المخصصة');
    try{return [{type:'custom',level:LEVELS.custom,expression:anchoredExpression(`(?:${source})`)}]}
    catch{throw Error('صيغة كلمات التقسيم غير صحيحة')}
  }
  const types=mode==='auto'?['unit','part','chapter','lesson']:[mode];
  return types.map(type=>({type,level:LEVELS[type],expression:anchoredExpression(TYPE_SOURCES[type])}));
}

function rowMetrics(row){
  const size=Math.max(1,...row.items.map(item=>Number(item.height||0)).filter(Number.isFinite));
  const y=Math.max(0,...row.items.map(item=>Number((item.y??item.transform?.[5])||0)).filter(Number.isFinite));
  return {size,y};
}

function classifyRow(text,expressions){
  for(const item of expressions){
    item.expression.lastIndex=0;
    if(item.expression.test(text))return item;
  }
  return null;
}

function looksLikeTocRow(text){
  const normalized=U().normalizeDigits(text);
  return /\.{2,}\s*\d+\s*$/.test(normalized)||/\s\d+\s*$/.test(normalized)&&normalized.length>28;
}

function pageLooksLikeContents(rows,expressions){
  const firstText=rows.slice(0,6).map(row=>U().clean(row.text)).join(' ');
  if(/(?:table\s+of\s+contents|contents|الفهرس|المحتويات)/iu.test(firstText))return true;
  let structural=0,tocLike=0;
  for(const row of rows){
    const text=U().clean(row.text);
    if(!text)continue;
    if(classifyRow(text,expressions)){
      structural++;
      if(looksLikeTocRow(text))tocLike++;
    }
  }
  return structural>=3&&(tocLike>=2||structural>=6);
}

function candidateScore({rowIndex,y,size,pageHeight,medianSize,text}){
  let score=48;
  const topRatio=pageHeight>0?y/pageHeight:0.5;
  const sizeRatio=medianSize>0?size/medianSize:1;
  if(topRatio>=0.72)score+=18;else if(topRatio>=0.55)score+=10;else if(topRatio<0.4)score-=24;
  if(rowIndex<=2)score+=9;else if(rowIndex<=5)score+=4;
  if(sizeRatio>=1.55)score+=18;else if(sizeRatio>=1.25)score+=10;else if(sizeRatio<0.9)score-=8;
  if(text.length<=45)score+=7;else if(text.length>120)score-=12;
  if(/[0-9٠-٩۰-۹IVXLCDM]/iu.test(text))score+=4;
  if(looksLikeTocRow(text))score-=28;
  return Math.max(1,Math.min(99,Math.round(score)));
}

function maybeExtendTitle(rows,rowIndex,baseTitle,baseSize,expressions){
  const next=rows[rowIndex+1];
  if(!next)return baseTitle;
  const text=U().clean(next.text);
  if(!text||text.length>100||text.length<3||classifyRow(text,expressions)||looksLikeTocRow(text))return baseTitle;
  const {size}=rowMetrics(next);
  if(size<baseSize*0.78)return baseTitle;
  if(/[.!?؟]$/.test(text)&&text.split(/\s+/).length>10)return baseTitle;
  return U().clean(`${baseTitle} — ${text}`);
}

function candidatesFromPage(rows,expressions,pageNo,pageHeight){
  if(!rows.length||pageLooksLikeContents(rows,expressions))return [];
  const sizes=rows.map(row=>rowMetrics(row).size).filter(Number.isFinite);
  const medianSize=U().median(sizes)||10;
  const candidates=[];
  const foundTypes=new Set();
  rows.forEach((row,rowIndex)=>{
    const text=U().clean(row.text);
    if(text.length<3||text.length>180)return;
    const kind=classifyRow(text,expressions);
    if(!kind||foundTypes.has(kind.type))return;
    const {size,y}=rowMetrics(row);
    if(pageHeight>0&&y<pageHeight*0.34)return;
    const confidence=candidateScore({rowIndex,y,size,pageHeight,medianSize,text});
    if(confidence<44)return;
    foundTypes.add(kind.type);
    candidates.push({
      type:kind.type,level:kind.level,page:pageNo,
      title:maybeExtendTitle(rows,rowIndex,text,size,expressions),
      confidence,size,y
    });
  });
  return candidates.sort((a,b)=>a.level-b.level||b.confidence-a.confidence);
}

function dedupeCandidates(candidates,minimumGap){
  const output=[];
  const lastByType=new Map();
  const seenByType=new Map();
  for(const candidate of candidates.sort((a,b)=>a.page-b.page||a.level-b.level||b.confidence-a.confidence)){
    if(!seenByType.has(candidate.type))seenByType.set(candidate.type,new Set());
    const seen=seenByType.get(candidate.type);
    const key=normalizeTitle(candidate.title);
    if(!key||seen.has(key))continue;
    const previous=lastByType.get(candidate.type);
    if(previous&&candidate.page-previous.page<minimumGap){
      if(candidate.confidence>previous.confidence+10){
        const index=output.indexOf(previous);
        if(index>=0)output.splice(index,1,candidate);
        lastByType.set(candidate.type,candidate);
        seen.add(key);
      }
      continue;
    }
    output.push(candidate);
    lastByType.set(candidate.type,candidate);
    seen.add(key);
  }
  return output.sort((a,b)=>a.page-b.page||a.level-b.level);
}

async function detectStructure(pdf){
  const expressions=detectionExpressions();
  const minimumGap=Math.max(1,Number($('#bookMinGap')?.value||2));
  const candidates=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    U().setProgress(4+(pageNo/pdf.numPages)*78,`تحليل هيكل الكتاب — الصفحة ${pageNo} من ${pdf.numPages}`);
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const rows=U().groupRows(content.items,{rtl:'auto'});
    const pageHeight=page.getViewport({scale:1}).height;
    candidates.push(...candidatesFromPage(rows,expressions,pageNo,pageHeight));
  }
  return dedupeCandidates(candidates,minimumGap);
}

function inferBoundaries(items,totalPages){
  const sections=items.map((item,index)=>({...item,id:`s${index+1}`,start:item.page,end:totalPages,parentId:null,autoEnd:true}));
  for(let i=0;i<sections.length;i++){
    const current=sections[i];
    for(let j=i+1;j<sections.length;j++){
      const next=sections[j];
      if(next.level<=current.level){
        current.end=Math.max(current.start,next.start-1);
        break;
      }
    }
  }
  for(let i=0;i<sections.length;i++){
    const current=sections[i];
    for(let j=i-1;j>=0;j--){
      const possible=sections[j];
      if(possible.level<current.level&&possible.start<=current.start&&possible.end>=current.start){
        current.parentId=possible.id;
        break;
      }
    }
  }
  return sections;
}

function applyFrontMatter(sections,totalPages,mode){
  if(!sections.length)return sections;
  const first=Math.min(...sections.map(section=>section.start));
  if(first<=1)return sections;
  if(mode==='attach'){
    const firstMain=sections.find(section=>section.start===first&&section.level===Math.min(...sections.filter(s=>s.start===first).map(s=>s.level)))||sections.find(section=>section.start===first);
    if(firstMain)firstMain.start=1;
  }else if(mode==='separate'){
    sections.unshift({id:'front-matter',type:'custom',level:0,title:'الصفحات التمهيدية — Front matter',start:1,end:first-1,parentId:null,confidence:100,autoEnd:true});
  }
  return sections.filter(section=>section.start>=1&&section.end>=section.start&&section.end<=totalPages);
}

function sectionDepth(section,sections){
  let depth=0,current=section,guard=0;
  while(current?.parentId&&guard++<10){
    depth++;
    current=sections.find(item=>item.id===current.parentId);
  }
  return depth;
}

function confidenceLabel(value){
  if(value>=82)return 'عالية';
  if(value>=62)return 'متوسطة';
  return 'تحتاج مراجعة';
}

function ensureResultStyles(){
  if($('#bookStructureStyles'))return;
  const style=document.createElement('style');
  style.id='bookStructureStyles';
  style.textContent=`
    .book-summary{cursor:default!important}.book-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .book-actions button{flex:1;min-width:170px}.book-node{cursor:default!important;position:relative}
    .book-node-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.book-title{font-weight:800;line-height:1.5}
    .book-meta{font-size:11px;color:var(--m);margin-top:4px}.book-range{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-top:9px}
    .book-range label{font-size:11px;color:var(--m)}.book-range input{display:block;width:100%;padding:8px;border:1px solid var(--l);border-radius:9px;margin-top:4px}
    .book-range button{padding:9px 11px}.book-badge{font-size:11px;background:#eef3ff;color:var(--b);padding:4px 7px;border-radius:999px;white-space:nowrap}
    .book-low{background:#fff5e8;color:#995a00}.book-tree-line{position:absolute;right:7px;top:10px;bottom:10px;width:2px;background:#e6ebf4;border-radius:4px}
    @media(max-width:620px){.book-range{grid-template-columns:1fr 1fr}.book-range button{grid-column:1/-1}.book-node{margin-right:0!important}}
  `;
  document.head.appendChild(style);
}

function sanitizeRange(section,totalPages){
  section.start=Math.max(1,Math.min(totalPages,Math.round(Number(section.start)||1)));
  section.end=Math.max(section.start,Math.min(totalPages,Math.round(Number(section.end)||section.start)));
}

function recomputeParents(sections){
  for(const section of sections)section.parentId=null;
  const ordered=[...sections].sort((a,b)=>a.start-b.start||a.level-b.level);
  for(let i=0;i<ordered.length;i++){
    const current=ordered[i];
    for(let j=i-1;j>=0;j--){
      const possible=ordered[j];
      if(possible.level<current.level&&possible.start<=current.start&&possible.end>=current.start){current.parentId=possible.id;break}
    }
  }
}

function renderStructure(state){
  ensureResultStyles();
  const results=$('#results');
  results.innerHTML='';
  const {sections,totalPages}=state;
  const counts={unit:0,part:0,chapter:0,lesson:0,custom:0};
  sections.forEach(section=>{counts[section.type]=(counts[section.type]||0)+1});
  const summary=document.createElement('div');
  summary.className='result book-summary';
  summary.innerHTML=`<b>تم بناء هيكل الكتاب تلقائيًا</b><small>${counts.unit?`${counts.unit} وحدة • `:''}${counts.chapter?`${counts.chapter} فصل • `:''}${counts.lesson?`${counts.lesson} درس • `:''}${counts.part?`${counts.part} قسم • `:''}${sections.length} نطاق إجمالًا\nيمكن تعديل صفحة البداية أو النهاية قبل التنزيل. النهايات الحالية محسوبة تلقائيًا من بداية القسم التالي.</small><div class="book-actions"><button class="primary" id="bookDownloadAll">تنزيل الهيكل كاملًا ZIP</button><button id="bookReinferEnds">إعادة حساب النهايات تلقائيًا</button></div>`;
  results.appendChild(summary);

  sections.forEach((section,index)=>{
    const depth=sectionDepth(section,sections);
    const card=document.createElement('div');
    card.className='result book-node';
    card.dataset.sectionId=section.id;
    card.style.marginRight=`${Math.min(depth,3)*18}px`;
    const low=section.confidence<62?' book-low':'';
    card.innerHTML=`${depth?'<span class="book-tree-line"></span>':''}<div class="book-node-head"><div class="book-title">${TYPE_ICONS[section.type]||'🔖'} ${U().escapeHtml(section.title)}</div><span class="book-badge${low}">${TYPE_LABELS[section.type]||'قسم'} • ثقة ${section.confidence}% (${confidenceLabel(section.confidence)})</span></div><div class="book-meta">النطاق: صفحة ${section.start} إلى ${section.end} • ${section.end-section.start+1} صفحة${section.autoEnd?' • النهاية مستنتجة تلقائيًا':''}</div><div class="book-range"><label>بداية القسم<input type="number" min="1" max="${totalPages}" value="${section.start}" data-range="start"></label><label>نهاية القسم<input type="number" min="1" max="${totalPages}" value="${section.end}" data-range="end"></label><button data-download="${section.id}">تنزيل هذا القسم</button></div>`;
    const startInput=card.querySelector('[data-range="start"]');
    const endInput=card.querySelector('[data-range="end"]');
    const update=()=>{
      section.start=Number(startInput.value);
      section.end=Number(endInput.value);
      section.autoEnd=false;
      sanitizeRange(section,totalPages);
      startInput.value=section.start;endInput.value=section.end;
      recomputeParents(sections);
      card.querySelector('.book-meta').textContent=`النطاق: صفحة ${section.start} إلى ${section.end} • ${section.end-section.start+1} صفحة • تم تعديل النطاق يدويًا`;
    };
    startInput.addEventListener('change',update);endInput.addEventListener('change',update);
    card.querySelector('[data-download]')?.addEventListener('click',async()=>{
      try{
        const bytes=await sectionBytes(state.sourceBytes,section.start,section.end);
        U().download(bytes,`${String(index+1).padStart(2,'0')}-${U().safeName(section.title)}.pdf`,'application/pdf');
      }catch(error){alert(error.message||'تعذر تنزيل القسم')}
    });
    results.appendChild(card);
  });

  $('#bookReinferEnds')?.addEventListener('click',()=>{
    const ordered=[...sections].sort((a,b)=>a.start-b.start||a.level-b.level);
    const rebuilt=inferBoundaries(ordered,totalPages);
    const byKey=new Map(rebuilt.map(item=>[`${item.type}|${normalizeTitle(item.title)}|${item.start}`,item]));
    sections.forEach(section=>{
      const match=byKey.get(`${section.type}|${normalizeTitle(section.title)}|${section.start}`);
      if(match){section.end=match.end;section.autoEnd=true}
    });
    recomputeParents(sections);
    renderStructure(state);
  });

  $('#bookDownloadAll')?.addEventListener('click',()=>downloadAll(state));
}

async function sectionBytes(sourceBytes,from,to){
  const source=await PDFLib.PDFDocument.load(sourceBytes.slice(0));
  const output=await PDFLib.PDFDocument.create();
  const indices=[];
  for(let page=from;page<=to;page++)indices.push(page-1);
  (await output.copyPages(source,indices)).forEach(page=>output.addPage(page));
  return output.save();
}

function zipPathFor(section,index,sections){
  const safe=U().safeName(section.title).slice(0,72)||`section-${index+1}`;
  const parent=section.parentId?sections.find(item=>item.id===section.parentId):null;
  if(parent){
    const parentIndex=sections.indexOf(parent);
    const parentSafe=U().safeName(parent.title).slice(0,55)||`group-${parentIndex+1}`;
    return `${String(parentIndex+1).padStart(2,'0')}-${parentSafe}/${String(index+1).padStart(2,'0')}-${safe}.pdf`;
  }
  return `${String(index+1).padStart(2,'0')}-${safe}.pdf`;
}

async function downloadAll(state){
  const zip=new JSZip();
  const valid=state.sections.filter(section=>section.end>=section.start);
  for(let index=0;index<valid.length;index++){
    const section=valid[index];
    U().setProgress(82+(index/Math.max(1,valid.length))*16,`تجهيز ${TYPE_LABELS[section.type]||'القسم'} ${index+1} من ${valid.length}`);
    zip.file(zipPathFor(section,index,valid),await sectionBytes(state.sourceBytes,section.start,section.end));
  }
  const manifest=valid.map(section=>({type:section.type,title:section.title,start:section.start,end:section.end,confidence:section.confidence,parentId:section.parentId}));
  zip.file('document-structure.json',JSON.stringify(manifest,null,2));
  U().download(await zip.generateAsync({type:'blob'}),`${U().safeName(state.file.name)}-structure.zip`,'application/zip');
  U().hideProgress();
}

async function runBook(){
  const file=[...($('#files')?.files||[])][0];
  if(!file)throw Error('اختر ملف PDF');
  const sourceBytes=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
  const detected=await detectStructure(pdf);
  U().hideProgress();
  const results=$('#results');
  if(!detected.length){
    results.innerHTML='<div class="result"><b>لم يتم العثور على وحدات أو فصول واضحة</b><small>إذا كان الملف صورة ممسوحة ضوئيًا فقد يحتاج OCR أولًا. ويمكن أيضًا تجربة “كلمات مخصصة” إذا كان الكتاب يستخدم أسماء مثل Module أو Appendix.</small></div>';
    return;
  }
  let sections=inferBoundaries(detected,pdf.numPages);
  sections=applyFrontMatter(sections,pdf.numPages,$('#bookFrontMatter')?.value||'keep');
  currentState={file,sourceBytes,pdf,totalPages:pdf.numPages,sections};
  renderStructure(currentState);
}

function init(){
  const tools=$('#tools'),run=$('#run');if(!tools||!run)return;
  tools.addEventListener('click',event=>{
    const button=event.target.closest('[data-tool]');
    active=button?.dataset.tool==='book';
    if(active)setTimeout(installOptions,20);
  });
  $('#reset')?.addEventListener('click',()=>{currentState=null;if(active)setTimeout(installOptions,20)});
  run.addEventListener('click',async event=>{
    if(!active||!tools.querySelector('[data-tool="book"].active'))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;await runBook()}catch(error){U()?.hideProgress();alert(error.message||'تعذر تحليل بنية الكتاب')}finally{run.disabled=false}
  },true);
}

window.ExplAppBookStructure=Object.freeze({inferBoundaries,dedupeCandidates,normalizeTitle});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
