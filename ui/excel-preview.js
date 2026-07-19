(()=>{
'use strict';

const FIELDS=[
  ['page','الصفحة'],['date','التاريخ'],['reference','رقم المرجع'],['cheque','رقم الشيك'],
  ['description','البيان'],['amount','المبلغ المباشر'],['debit','مدين'],['credit','دائن'],['balance','الرصيد'],['confidence','الثقة']
];
const EXPORT_FIELDS=FIELDS.filter(([field])=>field!=='confidence');
const TEMPLATE_KEY='explapp_excel_mapping_templates_v1';
const UNIQUE_TARGETS=new Set(['page','date','reference','cheque','amount','debit','credit','balance']);

function addStyles(){
  if(document.querySelector('#excelPreviewStyles'))return;
  const style=document.createElement('style');style.id='excelPreviewStyles';style.textContent=`
  .excel-preview-overlay{position:fixed;inset:0;z-index:1000;background:#101828aa;display:flex;align-items:center;justify-content:center;padding:14px}
  .excel-preview-dialog{width:min(1180px,100%);max-height:94vh;background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px #0005}
  .excel-preview-head{padding:14px 16px;border-bottom:1px solid #dbe3ef;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .excel-preview-head h2{margin:0;font-size:18px}.excel-preview-head small{color:#667085}
  .excel-template-bar{padding:10px 16px;border-bottom:1px solid #e5eaf2;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#f8faff}
  .excel-template-bar input,.excel-template-bar select{min-height:38px;border:1px solid #cfd8e6;border-radius:9px;padding:6px 9px;background:#fff}
  .excel-template-bar input{min-width:180px}.excel-template-bar button{padding:8px 12px}
  .excel-preview-scroll{overflow:auto;flex:1;padding:12px}
  .excel-preview-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:13px;direction:rtl}
  .excel-preview-table th{position:sticky;top:0;z-index:2;background:#eef3ff;color:#1d3f91;padding:7px;border:1px solid #d6deed;white-space:nowrap}
  .excel-preview-table th select{width:100%;min-width:105px;border:1px solid #b8c6dd;border-radius:7px;padding:6px;background:#fff;color:#173b86;font-weight:700}
  .excel-preview-table th select.mapping-duplicate{border-color:#d92d20;background:#fff1f0;color:#b42318;box-shadow:0 0 0 2px #fecdca}
  .excel-preview-table td{min-width:110px;max-width:320px;padding:8px;border:1px solid #e1e7f0;background:#fff;vertical-align:top}
  .excel-preview-table td[data-source-field="description"]{min-width:280px;white-space:normal}
  .excel-preview-table td[contenteditable="true"]:focus{outline:2px solid #2859d8;background:#f7f9ff}
  .excel-preview-table tr.low td{background:#fff8e7}.excel-preview-table tr:hover td{background:#f8faff}
  .excel-row-delete{background:#fff0f0;color:#b42318;padding:6px 9px;border-radius:8px}
  .excel-preview-actions{padding:12px 16px;border-top:1px solid #dbe3ef;display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap}
  .excel-preview-actions button{min-width:130px}.excel-preview-status{margin-inline-start:auto;color:#667085;font-size:12px;align-self:center}
  .excel-preview-status.error{color:#b42318;font-weight:700}
  @media(max-width:620px){.excel-preview-overlay{padding:0}.excel-preview-dialog{height:100vh;max-height:none;border-radius:0}.excel-preview-head{padding:10px}.excel-template-bar{padding:8px}.excel-template-bar input,.excel-template-bar select{flex:1;min-width:130px}.excel-preview-actions{position:sticky;bottom:0;background:#fff}.excel-preview-actions button{flex:1;min-width:120px}}
  `;document.head.appendChild(style);
}

function coerce(field,value){
  const text=String(value??'').trim();
  if(['page','amount','debit','credit','balance'].includes(field)&&text!==''){
    const number=Number(text.replace(/,/g,''));return Number.isFinite(number)?number:text;
  }
  return text;
}
function readTemplates(){try{return JSON.parse(localStorage.getItem(TEMPLATE_KEY)||'{}')}catch{return{}}}
function writeTemplates(value){localStorage.setItem(TEMPLATE_KEY,JSON.stringify(value))}
function currentMapping(table){return [...table.querySelectorAll('thead select[data-source-field]')].map(select=>({source:select.dataset.sourceField,target:select.value}))}
function validateMapping(mapping){
  const counts={};
  for(const item of mapping||[]){if(item.target&&UNIQUE_TARGETS.has(item.target))counts[item.target]=(counts[item.target]||0)+1}
  const duplicates=Object.keys(counts).filter(target=>counts[target]>1);
  return {valid:duplicates.length===0,duplicates};
}
function applyMapping(table,mapping){
  const bySource=Object.fromEntries((mapping||[]).map(item=>[item.source,item.target]));
  table.querySelectorAll('thead select[data-source-field]').forEach(select=>{if(bySource[select.dataset.sourceField]!==undefined)select.value=bySource[select.dataset.sourceField]});
}
function markMappingState(table,status){
  const mapping=currentMapping(table),result=validateMapping(mapping);
  table.querySelectorAll('thead select[data-source-field]').forEach(select=>select.classList.toggle('mapping-duplicate',result.duplicates.includes(select.value)));
  if(status){status.classList.toggle('error',!result.valid);status.textContent=result.valid?'يمكن حفظ تعيين الأعمدة لكل بنك':`لا يمكن تكرار تعيين: ${result.duplicates.map(field=>EXPORT_FIELDS.find(([key])=>key===field)?.[1]||field).join('، ')}`}
  return result;
}
function collect(table){
  const mapping=currentMapping(table);
  return [...table.querySelectorAll('tbody tr')].map(row=>{
    const record={};
    for(const {source,target} of mapping){
      if(!target)continue;
      const cell=row.querySelector(`[data-source-field="${source}"]`);
      const value=coerce(target,cell?.textContent||'');
      if(record[target]&&value)record[target]=`${record[target]} ${value}`.trim();else record[target]=value;
    }
    record.confidence=row.dataset.confidence||'';
    return record;
  });
}
function makeMappingSelect(source){
  const select=document.createElement('select');select.dataset.sourceField=source;
  const ignore=document.createElement('option');ignore.value='';ignore.textContent='تجاهل العمود';select.appendChild(ignore);
  for(const [field,label] of EXPORT_FIELDS){const option=document.createElement('option');option.value=field;option.textContent=label;option.selected=field===source;select.appendChild(option)}
  return select;
}
function fillTemplateSelect(select){
  const templates=readTemplates();select.innerHTML='<option value="">اختر قالبًا محفوظًا</option>';
  Object.keys(templates).sort((a,b)=>a.localeCompare(b,'ar')).forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;select.appendChild(option)});
}

function show(records,{fileName='bank-statement.pdf',onExport}={}){
  addStyles();document.querySelector('.excel-preview-overlay')?.remove();
  const overlay=document.createElement('div');overlay.className='excel-preview-overlay';
  const dialog=document.createElement('section');dialog.className='excel-preview-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  const head=document.createElement('div');head.className='excel-preview-head';
  const heading=document.createElement('div'),title=document.createElement('h2'),note=document.createElement('small');
  title.textContent='مراجعة البيانات وتعيين الأعمدة';note.textContent='غيّر نوع أي عمود، عدّل الخلايا، ثم صدّر Excel.';heading.append(title,note);
  const count=document.createElement('small');count.textContent=`${records.length} حركة مستخرجة`;head.append(heading,count);

  const templateBar=document.createElement('div');templateBar.className='excel-template-bar';
  const templateName=document.createElement('input');templateName.placeholder='اسم البنك أو القالب';templateName.setAttribute('aria-label','اسم القالب');
  const templateSelect=document.createElement('select');templateSelect.setAttribute('aria-label','القوالب المحفوظة');fillTemplateSelect(templateSelect);
  const saveTemplate=document.createElement('button');saveTemplate.type='button';saveTemplate.className='secondary';saveTemplate.textContent='حفظ التعيين';
  const deleteTemplate=document.createElement('button');deleteTemplate.type='button';deleteTemplate.className='danger';deleteTemplate.textContent='حذف القالب';
  templateBar.append(templateName,templateSelect,saveTemplate,deleteTemplate);

  const scroll=document.createElement('div');scroll.className='excel-preview-scroll';
  const table=document.createElement('table');table.className='excel-preview-table';
  const thead=document.createElement('thead'),headerRow=document.createElement('tr');
  for(const [source] of FIELDS){const th=document.createElement('th');th.appendChild(makeMappingSelect(source));headerRow.appendChild(th)}
  const actionTh=document.createElement('th');actionTh.textContent='حذف';headerRow.appendChild(actionTh);thead.appendChild(headerRow);
  const tbody=document.createElement('tbody');
  records.forEach(record=>{
    const row=document.createElement('tr');row.dataset.confidence=record.confidence||'';if(record.confidence==='منخفض')row.classList.add('low');
    for(const [field] of FIELDS){const cell=document.createElement('td');cell.dataset.sourceField=field;cell.contentEditable='true';cell.spellcheck=false;cell.textContent=record[field]??'';row.appendChild(cell)}
    const action=document.createElement('td'),del=document.createElement('button');del.type='button';del.className='excel-row-delete';del.textContent='حذف';del.onclick=()=>{row.remove();count.textContent=`${tbody.rows.length} حركة مستخرجة`};action.appendChild(del);row.appendChild(action);tbody.appendChild(row);
  });
  table.append(thead,tbody);scroll.appendChild(table);

  const actions=document.createElement('div');actions.className='excel-preview-actions';
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='primary';exportButton.textContent='اعتماد وتنزيل Excel';
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='danger';cancelButton.textContent='إلغاء';
  const status=document.createElement('span');status.className='excel-preview-status';status.textContent='يمكن حفظ تعيين الأعمدة لكل بنك';

  table.addEventListener('change',event=>{if(event.target.matches('thead select[data-source-field]'))markMappingState(table,status)});
  templateSelect.onchange=()=>{const name=templateSelect.value;if(!name)return;const templates=readTemplates();applyMapping(table,templates[name]);templateName.value=name;markMappingState(table,status)};
  saveTemplate.onclick=()=>{const state=markMappingState(table,status);if(!state.valid){alert('صحح تعيين الأعمدة المكرر أولًا');return}const name=templateName.value.trim();if(!name){alert('اكتب اسم البنك أو القالب');return}const templates=readTemplates();templates[name]=currentMapping(table);writeTemplates(templates);fillTemplateSelect(templateSelect);templateSelect.value=name;alert('تم حفظ تعيين الأعمدة')};
  deleteTemplate.onclick=()=>{const name=templateSelect.value||templateName.value.trim();if(!name)return;const templates=readTemplates();delete templates[name];writeTemplates(templates);fillTemplateSelect(templateSelect);templateName.value=''};
  exportButton.onclick=()=>{const state=markMappingState(table,status);if(!state.valid){alert('يوجد تعيين مكرر لعمود مالي أو تعريفي');return}const edited=collect(table);if(!edited.length){alert('لا توجد صفوف للتصدير');return}onExport?.(edited,fileName);overlay.remove()};
  cancelButton.onclick=()=>overlay.remove();overlay.onclick=event=>{if(event.target===overlay)overlay.remove()};
  actions.append(exportButton,cancelButton,status);dialog.append(head,templateBar,scroll,actions);overlay.appendChild(dialog);document.body.appendChild(overlay);
  markMappingState(table,status);setTimeout(()=>table.querySelector('tbody td')?.focus(),0);
}

window.ExplAppExcelPreview={show,collect,currentMapping,applyMapping,validateMapping};
})();