(()=>{
'use strict';
let excelMode=false;

function addOptions(){
  if(document.querySelector('#excelFinancialOpt'))return;
  const panel=document.querySelector('.panel');
  const run=document.querySelector('#run');
  if(!panel||!run)return;
  const box=document.createElement('div');
  box.id='excelFinancialOpt';
  box.className='hidden';
  box.innerHTML='<div class="row"><div class="field"><label>نوع الملف</label><select id="excelSource"><option value="auto">اكتشاف تلقائي</option><option value="text">PDF نصي</option><option value="image">PDF مصور OCR عربي</option></select></div><div class="field"><label>نوع الكشف</label><select id="excelProfile"><option value="bank">كشف بنك / مالي</option><option value="general">جدول عام</option></select></div></div><div class="note">بعد الاستخراج ستظهر شاشة مراجعة قابلة للتعديل قبل تنزيل Excel.</div>';
  run.parentElement.insertAdjacentElement('beforebegin',box);
}

async function detectMode(pdf){
  const first=await pdf.getPage(1);
  const content=await first.getTextContent();
  return content.items.map(item=>item.str).join('').trim().length>20?'text':'image';
}

async function extractExcelRecords(){
  const core=window.ExplAppPdfExcelCore;
  if(!core)throw Error('محرك PDF إلى Excel غير محمل');
  const file=document.querySelector('#files')?.files?.[0];
  if(!file)throw Error('اختر ملف PDF');
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  let mode=document.querySelector('#excelSource')?.value||'auto';
  if(mode==='auto')mode=await detectMode(pdf);
  const records=mode==='image'?await core.extractOcrRows(pdf,'ara+eng'):await core.extractTextRows(pdf);
  if(!records.length)throw Error('لم يتم اكتشاف حركات قابلة للمراجعة');
  return {records,fileName:file.name};
}

async function runExcelConversion(){
  const core=window.ExplAppPdfExcelCore;
  const preview=window.ExplAppExcelPreview;
  if(!preview)throw Error('شاشة معاينة Excel غير محملة');
  const {records,fileName}=await extractExcelRecords();
  preview.show(records,{fileName,onExport:(edited,name)=>core.exportXlsx(edited,name)});
}

function setExcelUi(active){
  excelMode=active;
  document.querySelector('#excelFinancialOpt')?.classList.toggle('hidden',!active);
  document.querySelector('#options')?.classList.toggle('hidden',active);
}

function init(){
  const tools=document.querySelector('.tools');
  if(!tools)return;
  addOptions();
  if(tools.querySelector('[data-excel-entry="true"]'))return;
  const tablesButton=tools.querySelector('[data-tool="tables"]');
  if(!tablesButton)return;

  const button=document.createElement('button');
  button.type='button';
  button.className='tool';
  button.dataset.excelEntry='true';
  button.innerHTML='<b>📗 PDF إلى Excel</b><span>استخراج، مراجعة، ثم تنزيل</span>';
  button.onclick=()=>{
    tablesButton.click();
    setExcelUi(true);
    document.querySelectorAll('.tool').forEach(item=>item.classList.remove('active'));
    button.classList.add('active');
    const title=document.querySelector('#dropTitle');
    const hint=document.querySelector('#dropHint');
    if(title)title.textContent='اختر كشف PDF لتحويله إلى Excel';
    if(hint)hint.textContent='نصي أو مصور — عربي — مع مراجعة قبل التنزيل';
  };
  tools.insertBefore(button,tablesButton);

  for(const other of tools.querySelectorAll('.tool:not([data-excel-entry="true"])')){
    other.addEventListener('click',()=>setExcelUi(false));
  }

  document.querySelector('#reset')?.addEventListener('click',()=>{
    if(excelMode)setTimeout(()=>setExcelUi(true),0);
  });

  const run=document.querySelector('#run');
  run.addEventListener('click',async event=>{
    if(!excelMode)return;
    event.stopImmediatePropagation();
    event.preventDefault();
    try{
      run.disabled=true;
      await runExcelConversion();
    }catch(error){
      alert(error.message||'تعذر التحويل');
    }finally{
      run.disabled=false;
    }
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();