(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const DB_NAME='explapp-pdf-studio-local';
const DB_VERSION=1;
const STORE='session';
const FILE_KEY='last-pdf';
const META_KEY='explappPdfStudio:lastSession:v1';
let restoring=false;
let restoredFile=null;
let saveTimer=null;

const TOOL_NAMES={
  split:'تقسيم واستخراج',merge:'دمج PDF',organize:'ترتيب وتدوير',search:'البحث',txt:'تحويل إلى TXT',
  md:'تحويل إلى Markdown',word:'تحويل إلى Word',images:'تحويل إلى صور',ocr:'OCR',tables:'استخراج الجداول',
  book:'أدوات الكتب / التقطيع حسب Chapter',batch:'معالجة جماعية',blank:'حذف الصفحات الفارغة',compare:'مقارنة ملفين'
};

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(Error('IndexedDB غير متاح'));return}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('تعذر فتح التخزين المحلي'));
  });
}

async function dbPut(record){
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||Error('تعذر الحفظ'));
  });
  db.close();
}

async function dbGet(id){
  const db=await openDb();
  const value=await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const request=tx.objectStore(STORE).get(id);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error||Error('تعذر الاستعادة'));
  });
  db.close();
  return value;
}

async function dbDelete(id){
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||Error('تعذر الحذف'));
  });
  db.close();
}

function readMeta(){
  try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')||{}}catch{return {}}
}

function writeMeta(patch){
  const next={...readMeta(),...patch,updatedAt:Date.now()};
  try{localStorage.setItem(META_KEY,JSON.stringify(next))}catch{}
  renderSessionBar();
  return next;
}

function activeTool(){
  return document.querySelector('#tools [data-tool].active')?.dataset.tool||'split';
}

function optionSnapshot(){
  const values={};
  document.querySelectorAll('#options input[id],#options select[id],#options textarea[id]').forEach(el=>{
    if(el.type==='file')return;
    values[el.id]=el.type==='checkbox'?Boolean(el.checked):el.value;
  });
  return values;
}

function operationDescription(tool,options){
  if(tool==='split')return `تقسيم الصفحات: ${options.pages||'كل الصفحات'}`;
  if(tool==='book'){
    const mode=options.bookStructureMode||'chapter';
    const label={chapter:'Chapter / الفصل',unit:'Unit / الوحدة',lesson:'Lesson / الدرس',part:'Part / القسم',auto:'تلقائي'}[mode]||mode;
    return `تقطيع الكتاب حسب ${label}`;
  }
  if(tool==='ocr')return `OCR — الصفحات: ${options.ocrPages||'الكل'}`;
  if(tool==='tables')return `استخراج الجداول — الصفحات: ${options.tablePages||'الكل'}`;
  return TOOL_NAMES[tool]||tool;
}

function formatTime(timestamp){
  if(!timestamp)return '';
  try{return new Intl.DateTimeFormat('ar',{dateStyle:'short',timeStyle:'short'}).format(new Date(timestamp))}catch{return new Date(timestamp).toLocaleString()}
}

function ensureStyles(){
  if($('#sessionPersistenceStyles'))return;
  const style=document.createElement('style');
  style.id='sessionPersistenceStyles';
  style.textContent=`
    .session-memory{margin:12px 0 0;border:1px solid var(--l);border-radius:14px;background:#f8fbff;padding:10px 12px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .session-memory-text{font-size:12px;line-height:1.7;color:var(--m);flex:1;min-width:220px}.session-memory-text b{color:var(--t)}
    .session-memory-actions{display:flex;gap:7px;flex-wrap:wrap}.session-memory-actions button{padding:8px 11px;font-size:12px}
    .session-memory-ok{color:var(--ok);font-weight:800}.session-memory-warn{color:#8a5a00;font-weight:800}
    @media(max-width:620px){.session-memory{display:block}.session-memory-actions{margin-top:8px}.session-memory-actions button{flex:1}}
  `;
  document.head.appendChild(style);
}

function ensureSessionBar(){
  ensureStyles();
  let bar=$('#sessionMemoryBar');
  if(bar)return bar;
  bar=document.createElement('div');
  bar.id='sessionMemoryBar';
  bar.className='session-memory';
  const panel=document.querySelector('.panel');
  const drop=$('#drop');
  if(panel&&drop)drop.insertAdjacentElement('afterend',bar);
  return bar;
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function renderSessionBar(extra=''){
  const bar=ensureSessionBar();
  if(!bar)return;
  const meta=readMeta();
  const fileName=meta.fileName||'لا يوجد ملف محفوظ بعد';
  const operation=meta.lastOperation?.description||'لا توجد عملية محفوظة بعد';
  const when=meta.lastOperation?.at?` — ${formatTime(meta.lastOperation.at)}`:'';
  bar.innerHTML=`<div class="session-memory-text"><b>آخر ملف:</b> ${escapeHtml(fileName)}<br><b>آخر عملية:</b> ${escapeHtml(operation)}${escapeHtml(when)} ${extra?`<span class="session-memory-ok">${escapeHtml(extra)}</span>`:''}</div><div class="session-memory-actions"><button type="button" id="restoreLastPdf">فتح آخر ملف</button><button type="button" id="clearLastSession" class="danger">مسح المحفوظ</button></div>`;
  $('#restoreLastPdf')?.addEventListener('click',()=>restoreLastFile({force:true}));
  $('#clearLastSession')?.addEventListener('click',clearSavedSession);
}

async function saveFile(file){
  if(!file||!/\.pdf$/i.test(file.name))return;
  restoredFile=file;
  try{
    await dbPut({id:FILE_KEY,blob:file,name:file.name,type:file.type||'application/pdf',lastModified:file.lastModified||Date.now(),size:file.size,savedAt:Date.now()});
    writeMeta({fileName:file.name,fileSize:file.size,fileSaved:true,fileSaveError:null});
    renderSessionBar('تم حفظ الملف محليًا');
  }catch(error){
    writeMeta({fileName:file.name,fileSize:file.size,fileSaved:false,fileSaveError:String(error?.message||error)});
    const bar=ensureSessionBar();
    if(bar){
      const text=bar.querySelector('.session-memory-text');
      if(text)text.insertAdjacentHTML('beforeend','<br><span class="session-memory-warn">تعذر حفظ الملف نفسه بسبب مساحة التخزين، لكن تم حفظ آخر عملية.</span>');
    }
  }
}

function assignFileToInput(file){
  const input=$('#files');
  if(!input||!file)return false;
  try{
    const transfer=new DataTransfer();
    transfer.items.add(file);
    input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }catch{
    try{
      if(typeof input.onchange==='function')input.onchange({target:{files:[file]}});
      restoredFile=file;
      return true;
    }catch{return false}
  }
}

async function restoreLastFile({force=false}={}){
  if(restoring)return;
  restoring=true;
  try{
    const record=await dbGet(FILE_KEY);
    if(!record?.blob){if(force)renderSessionBar('لا يوجد ملف محفوظ');return}
    const file=new File([record.blob],record.name,{type:record.type||'application/pdf',lastModified:record.lastModified||Date.now()});
    restoredFile=file;
    const ok=assignFileToInput(file);
    if(ok)renderSessionBar('تمت استعادة آخر ملف');
    else if(force)renderSessionBar('تعذر فتح الملف تلقائيًا على هذا المتصفح');
  }catch{if(force)renderSessionBar('تعذر استعادة الملف')}
  finally{restoring=false}
}

function applySavedToolAndOptions(){
  const meta=readMeta();
  const tool=meta.activeTool||meta.lastOperation?.tool;
  if(tool){
    const button=document.querySelector(`#tools [data-tool="${CSS.escape(tool)}"]`);
    if(button&&!button.classList.contains('active'))button.click();
  }
  const saved=meta.options||meta.lastOperation?.options||{};
  const apply=()=>{
    Object.entries(saved).forEach(([id,value])=>{
      const el=document.getElementById(id);
      if(!el)return;
      if(el.type==='checkbox')el.checked=Boolean(value);else el.value=String(value??'');
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
  };
  setTimeout(apply,80);
  setTimeout(apply,260);
}

function saveUiState(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    writeMeta({activeTool:activeTool(),options:optionSnapshot()});
  },180);
}

function rememberOperation(){
  const tool=activeTool();
  const options=optionSnapshot();
  const file=[...($('#files')?.files||[])][0]||restoredFile;
  writeMeta({
    activeTool:tool,options,
    fileName:file?.name||readMeta().fileName||'',
    lastOperation:{tool,toolName:TOOL_NAMES[tool]||tool,description:operationDescription(tool,options),options,at:Date.now()}
  });
}

async function clearSavedSession(){
  try{await dbDelete(FILE_KEY)}catch{}
  try{localStorage.removeItem(META_KEY)}catch{}
  restoredFile=null;
  renderSessionBar('تم مسح الملف وآخر عملية');
}

function init(){
  ensureStyles();
  renderSessionBar();
  const files=$('#files');
  files?.addEventListener('change',event=>{
    if(restoring)return;
    const file=[...(event.target.files||[])].find(item=>/\.pdf$/i.test(item.name));
    if(file)saveFile(file);
  });
  $('#drop')?.addEventListener('drop',event=>{
    const file=[...(event.dataTransfer?.files||[])].find(item=>/\.pdf$/i.test(item.name));
    if(file)saveFile(file);
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('#run'))rememberOperation();
    const toolButton=event.target.closest('#tools [data-tool]');
    if(toolButton)setTimeout(saveUiState,60);
  },true);
  document.addEventListener('input',event=>{if(event.target.closest('#options'))saveUiState()},true);
  document.addEventListener('change',event=>{if(event.target.closest('#options'))saveUiState()},true);
  applySavedToolAndOptions();
  setTimeout(()=>restoreLastFile({force:false}),320);
}

window.ExplAppSession=Object.freeze({
  getActiveFile:()=>[...($('#files')?.files||[])][0]||restoredFile,
  restoreLastFile,
  clearSavedSession,
  getMeta:readMeta
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
