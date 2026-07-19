(()=>{
'use strict';

let tableMode=false;
const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;

function renderOptions(){
  const options=$('#options');
  if(!options)return;
  options.classList.remove('hidden');
  options.innerHTML=`<div class="row">
    <div class="field"><label>نوع الملف</label><select id="tableSource"><option value="auto">اكتشاف تلقائي</option><option value="text">PDF نصي</option><option value="image">PDF مصور OCR</option></select></div>
    <div class="field"><label>الصفحات</label><input id="tablePagesAdvanced" type="text" placeholder="فارغ = كل الصفحات"></div>
    <div class="field"><label>الإخراج</label><select id="tableOutput"><option value="xlsx">Excel — ورقة لكل جدول</option><option value="csv">CSV داخل ZIP</option></select></div>
  </div><div class="note">تظهر معاينة قابلة للتعديل قبل التنزيل. يدعم الجداول النصية والمصورة ويقسم الجداول المنفصلة تلقائيًا.</div>`;
}

function setProgress(value,message){U()?.setProgress(value,message)}
function hideProgress(){U()?.hideProgress()}

function physicalItems(content){
  return content.items.map(item=>({
    text:item.str||'',x:item.transform?.[4]||0,y:item.transform?.[5]||0,
    width:item.width||0,height:Math.max(1,Math.abs(item.height||item.transform?.[0]||10))
  }));
}

function rowToCells(row){
  const items=[...row.items].sort((a,b)=>row.rtl?b.x-a.x:a.x-b.x);
  if(!items.length)return[];
  const charWidths=items.map(item=>item.width/Math.max(1,item.text.length)).filter(Number.isFinite);
  const charWidth=U().median(charWidths)||5;
  const cells=[];
  let current=[];
  for(let index=0;index<items.length;index++){
    const item=items[index];
    if(current.length){
      const previous=items[index-1];
      const gap=row.rtl?(previous.x-(item.x+item.width)):(item.x-(previous.x+previous.width));
      const threshold=Math.max(16,row.height*1.25,charWidth*3.2);
      if(gap>threshold){cells.push(U().clean(current.map(part=>part.text).join(' ')));current=[]}
    }
    current.push(item);
  }
  if(current.length)cells.push(U().clean(current.map(part=>part.text).join(' ')));
  return cells.filter(Boolean);
}

function numericLike(value){
  const text=U().clean(value).replace(/[٠-٩]/g,digit=>'٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[٬,\s]/g,'');
  return /^\(?[-+]?\d+(?:\.\d+)?\)?(?:\s*(?:د\.؟أ|ر\.؟س|USD|JOD|SAR))?$/i.test(text);
}

function dateLike(value){
  const text=U().clean(value).replace(/[٠-٩]/g,digit=>'٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
  return /^(?:\d{1,4}[\/.-]){2}\d{1,4}$/.test(text);
}

function appendContinuation(current,row){
  if(!current.length||row.cells.length!==1)return false;
  const text=U().clean(row.cells[0]);
  if(!text||numericLike(text)||dateLike(text))return false;
  const target=current[current.length-1].cells;
  if(!target?.length)return false;
  let index=target.findIndex(cell=>cell&&!numericLike(cell)&&!dateLike(cell));
  if(index<0)index=target.findIndex(cell=>!cell);
  if(index<0)return false;
  target[index]=U().clean(`${target[index]||''} ${text}`);
  return true;
}

function segmentTables(rows,pageNo){
  const candidates=rows.map(row=>({...row,cells:rowToCells(row)}));
  const heights=candidates.map(row=>row.height);
  const typicalHeight=U().median(heights)||10;
  const tables=[];
  let current=[];
  let previous=null;
  const flush=()=>{
    const useful=current.filter(row=>row.cells.length>=2);
    if(useful.length>=2)tables.push({page:pageNo,rows:useful.map(row=>row.cells)});
    current=[];
  };
  for(const row of candidates){
    const gap=previous?Math.abs(previous.y-row.y):0;
    if(row.cells.length<2){
      const closeToPrevious=previous&&gap<=typicalHeight*1.9;
      if(row.cells.length===1&&closeToPrevious&&appendContinuation(current,row)){
        previous=row;
        continue;
      }
      if(current.length>=2)flush();
      previous=row;
      continue;
    }
    const medianColumns=U().median(current.map(item=>item.cells.length))||row.cells.length;
    const columnBreak=current.length>=2&&Math.abs(row.cells.length-medianColumns)>=Math.max(3,medianColumns);
    if(current.length&&(gap>typicalHeight*2.8||columnBreak))flush();
    current.push(row);
    previous=row;
  }
  flush();
  if(!tables.length){
    const all=candidates.filter(row=>row.cells.length>=2);
    if(all.length)tables.push({page:pageNo,rows:all.map(row=>row.cells)});
  }
  return tables;
}

async function extractTextPage(page,pageNo){
  const content=await page.getTextContent();
  const rows=U().groupRows(physicalItems(content),{rtl:'auto'});
  return segmentTables(rows,pageNo);
}

async function renderOcrCanvas(page){
  const viewport=page.getViewport({scale:2.2});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:context,viewport}).promise;
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  const data=image.data;
  for(let i=0;i<data.length;i+=4){
    const gray=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);
    const value=gray>205?255:gray<75?0:gray;
    data[i]=data[i+1]=data[i+2]=value;
  }
  context.putImageData(image,0,0);
  return canvas;
}

function ocrWordsToRows(words){
  const items=(words||[]).filter(word=>U().clean(word.text)).map(word=>({
    text:word.text,
    x:word.bbox?.x0||0,
    y:-(word.bbox?.y0||0),
    width:Math.max(1,(word.bbox?.x1||0)-(word.bbox?.x0||0)),
    height:Math.max(1,(word.bbox?.y1||0)-(word.bbox?.y0||0))
  }));
  return U().groupRows(items,{yTolerance:.55,rtl:'auto'});
}

async function extractOcrPage(page,pageNo,worker){
  const canvas=await renderOcrCanvas(page);
  const result=await worker.recognize(canvas);
  const rows=ocrWordsToRows(result.data.words);
  if(!rows.length&&result.data.text){
    const fallback=result.data.text.split(/\n+/).map((text,index)=>({
      y:-index*14,height:12,rtl:U().arabicDominant(text),items:[{text,x:0,y:-index*14,width:text.length*7,height:12}]
    }));
    return segmentTables(fallback,pageNo);
  }
  return segmentTables(rows,pageNo);
}

async function pageHasText(page){
  const content=await page.getTextContent();
  return content.items.map(item=>item.str||'').join('').replace(/\s/g,'').length>20;
}

async function extractTables(file){
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pages=U().parsePages($('#tablePagesAdvanced')?.value||'',pdf.numPages);
  const source=$('#tableSource')?.value||'auto';
  const tables=[];
  let worker=null;
  try{
    for(let index=0;index<pages.length;index++){
      const pageNo=pages[index]+1;
      const page=await pdf.getPage(pageNo);
      const useOcr=source==='image'||(source==='auto'&&!(await pageHasText(page)));
      setProgress(5+(index/pages.length)*82,`${useOcr?'OCR وفهم':'تحليل'} جدول الصفحة ${pageNo}`);
      if(useOcr){
        if(!navigator.onLine)throw Error('الجداول المصورة تحتاج الإنترنت في أول استخدام لتحميل OCR العربي');
        if(!worker)worker=await Tesseract.createWorker('ara+eng');
        tables.push(...await extractOcrPage(page,pageNo,worker));
      }else tables.push(...await extractTextPage(page,pageNo));
    }
  }finally{
    if(worker)await worker.terminate();
  }
  tables.forEach((table,index)=>table.number=index+1);
  return tables;
}

function normalizeWidth(rows){
  const width=Math.max(1,...rows.map(row=>row.length));
  return rows.map(row=>Array.from({length:width},(_,index)=>row[index]??''));
}

function addPreviewStyles(){
  if($('#tableAdvancedStyles'))return;
  const style=document.createElement('style');style.id='tableAdvancedStyles';style.textContent=`
  .table-adv-overlay{position:fixed;inset:0;z-index:1200;background:#101828b8;padding:12px;display:flex;align-items:center;justify-content:center}
  .table-adv-dialog{width:min(1180px,100%);max-height:95vh;background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden}
  .table-adv-head,.table-adv-actions{padding:12px 14px;border-bottom:1px solid #dbe3ef;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .table-adv-actions{border-top:1px solid #dbe3ef;border-bottom:0}.table-adv-scroll{overflow:auto;flex:1;padding:10px}
  .table-adv-table{border-collapse:collapse;min-width:100%;width:max-content;direction:rtl}.table-adv-table td{border:1px solid #dbe3ef;padding:8px;min-width:120px;max-width:320px}
  .table-adv-table td:focus{outline:2px solid #2859d8;background:#f5f8ff}.table-adv-table tr:first-child td{font-weight:700;background:#eef3ff}
  .table-adv-delete{background:#fff0f0;color:#b42318;padding:6px 9px}.table-adv-head select{min-width:210px;padding:9px;border:1px solid #dbe3ef;border-radius:10px}
  @media(max-width:620px){.table-adv-overlay{padding:0}.table-adv-dialog{height:100vh;max-height:none;border-radius:0}.table-adv-actions button{flex:1}}
  `;document.head.appendChild(style);
}

function collectRows(table){
  return [...table.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td[data-cell]')].map(cell=>U().clean(cell.textContent)));
}

function showPreview(tables,fileName){
  addPreviewStyles();
  $('.table-adv-overlay')?.remove();
  const overlay=document.createElement('div');overlay.className='table-adv-overlay';
  const dialog=document.createElement('section');dialog.className='table-adv-dialog';
  const head=document.createElement('div');head.className='table-adv-head';
  const title=document.createElement('strong');title.textContent=`تم اكتشاف ${tables.length} جدول`;
  const selector=document.createElement('select');
  tables.forEach((table,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`الجدول ${index+1} — الصفحة ${table.page}`;selector.appendChild(option)});
  head.append(title,selector);
  const scroll=document.createElement('div');scroll.className='table-adv-scroll';
  const grid=document.createElement('table');grid.className='table-adv-table';scroll.appendChild(grid);
  let active=0;
  const edited=tables.map(table=>normalizeWidth(table.rows));
  const render=()=>{
    grid.innerHTML='<tbody></tbody>';const body=grid.tBodies[0];
    edited[active].forEach(values=>{
      const row=document.createElement('tr');
      values.forEach(value=>{const cell=document.createElement('td');cell.dataset.cell='1';cell.contentEditable='true';cell.spellcheck=false;cell.textContent=value;row.appendChild(cell)});
      const action=document.createElement('td');const del=document.createElement('button');del.className='table-adv-delete';del.textContent='حذف الصف';del.onclick=()=>{row.remove()};action.appendChild(del);row.appendChild(action);body.appendChild(row);
    });
  };
  const saveActive=()=>{edited[active]=collectRows(grid)};
  selector.onchange=()=>{saveActive();active=Number(selector.value);render()};render();
  const actions=document.createElement('div');actions.className='table-adv-actions';
  const exportButton=document.createElement('button');exportButton.className='primary';exportButton.textContent='اعتماد وتنزيل';
  const cancel=document.createElement('button');cancel.className='danger';cancel.textContent='إلغاء';
  exportButton.onclick=async()=>{saveActive();await exportTables(tables,edited,fileName);overlay.remove()};cancel.onclick=()=>overlay.remove();
  actions.append(exportButton,cancel);dialog.append(head,scroll,actions);overlay.appendChild(dialog);document.body.appendChild(overlay);
}

async function exportTables(meta,edited,fileName){
  const base=U().safeName(fileName);
  const format=$('#tableOutput')?.value||'xlsx';
  if(format==='csv'){
    const zip=new JSZip();
    edited.forEach((rows,index)=>{
      const csv='\ufeff'+rows.map(row=>row.map(U().csvCell).join(',')).join('\n');
      zip.file(`${base}-table-${index+1}-page-${meta[index].page}.csv`,csv);
    });
    U().download(await zip.generateAsync({type:'blob'}),`${base}-tables.zip`,'application/zip');
    return;
  }
  const workbook=XLSX.utils.book_new();
  edited.forEach((rows,index)=>{
    const sheet=XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=Array.from({length:Math.max(1,...rows.map(row=>row.length))},(_,column)=>({wch:Math.min(45,Math.max(12,...rows.map(row=>String(row[column]??'').length+2)))}));
    sheet['!views']=[{rightToLeft:true}];
    XLSX.utils.book_append_sheet(workbook,sheet,`جدول ${index+1} ص${meta[index].page}`.slice(0,31));
  });
  U().download(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),`${base}-tables.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

async function runTables(){
  const file=$('#files')?.files?.[0];if(!file)throw Error('اختر ملف PDF');
  const tables=await extractTables(file);
  if(!tables.length)throw Error('لم يتم اكتشاف جداول قابلة للمراجعة');
  hideProgress();showPreview(tables,file.name);
}

function activate(){tableMode=true;setTimeout(()=>{renderOptions();const title=$('#dropTitle'),hint=$('#dropHint');if(title)title.textContent='اختر PDF لاستخراج الجداول';if(hint)hint.textContent='نصي أو مصور — معاينة وتعديل قبل Excel'},0)}

function init(){
  const tools=$('#tools'),run=$('#run');if(!tools||!run)return;
  const button=tools.querySelector('[data-tool="tables"]');if(!button)return;
  button.addEventListener('click',activate);
  tools.querySelectorAll('.tool:not([data-tool="tables"])').forEach(item=>item.addEventListener('click',()=>{tableMode=false}));
  $('#reset')?.addEventListener('click',()=>{if(tableMode)setTimeout(renderOptions,0)});
  run.addEventListener('click',async event=>{
    if(!tableMode||!button.classList.contains('active'))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;await runTables()}catch(error){hideProgress();alert(error.message||'تعذر استخراج الجداول')}finally{run.disabled=false}
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
