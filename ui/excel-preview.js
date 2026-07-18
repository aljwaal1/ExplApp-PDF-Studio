(()=>{
'use strict';

const FIELDS=[
  ['page','الصفحة'],['date','التاريخ'],['reference','رقم المرجع'],['cheque','رقم الشيك'],
  ['description','البيان'],['debit','مدين'],['credit','دائن'],['balance','الرصيد'],['confidence','الثقة']
];

function addStyles(){
  if(document.querySelector('#excelPreviewStyles'))return;
  const style=document.createElement('style');
  style.id='excelPreviewStyles';
  style.textContent=`
  .excel-preview-overlay{position:fixed;inset:0;z-index:1000;background:#101828aa;display:flex;align-items:center;justify-content:center;padding:14px}
  .excel-preview-dialog{width:min(1180px,100%);max-height:94vh;background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px #0005}
  .excel-preview-head{padding:14px 16px;border-bottom:1px solid #dbe3ef;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .excel-preview-head h2{margin:0;font-size:18px}.excel-preview-head small{color:#667085}
  .excel-preview-scroll{overflow:auto;flex:1;padding:12px}
  .excel-preview-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:13px;direction:rtl}
  .excel-preview-table th{position:sticky;top:0;z-index:2;background:#eef3ff;color:#1d3f91;padding:9px;border:1px solid #d6deed;white-space:nowrap}
  .excel-preview-table td{min-width:110px;max-width:320px;padding:8px;border:1px solid #e1e7f0;background:#fff;vertical-align:top}
  .excel-preview-table td[data-field="description"]{min-width:280px;white-space:normal}
  .excel-preview-table td[contenteditable="true"]:focus{outline:2px solid #2859d8;background:#f7f9ff}
  .excel-preview-table tr.low td{background:#fff8e7}.excel-preview-table tr:hover td{background:#f8faff}
  .excel-row-delete{background:#fff0f0;color:#b42318;padding:6px 9px;border-radius:8px}
  .excel-preview-actions{padding:12px 16px;border-top:1px solid #dbe3ef;display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap}
  .excel-preview-actions button{min-width:130px}.excel-preview-status{margin-inline-start:auto;color:#667085;font-size:12px;align-self:center}
  @media(max-width:620px){.excel-preview-overlay{padding:0}.excel-preview-dialog{height:100vh;max-height:none;border-radius:0}.excel-preview-head{padding:10px}.excel-preview-actions{position:sticky;bottom:0;background:#fff}.excel-preview-actions button{flex:1;min-width:120px}}
  `;
  document.head.appendChild(style);
}

function coerce(field,value){
  const text=String(value??'').trim();
  if(['page','debit','credit','balance'].includes(field)&&text!==''){
    const normalized=text.replace(/,/g,'');
    const number=Number(normalized);
    return Number.isFinite(number)?number:text;
  }
  return text;
}

function collect(table){
  return [...table.querySelectorAll('tbody tr')].map(row=>{
    const record={};
    for(const [field] of FIELDS){
      const cell=row.querySelector(`[data-field="${field}"]`);
      record[field]=coerce(field,cell?.textContent||'');
    }
    return record;
  });
}

function show(records,{fileName='bank-statement.pdf',onExport}={}){
  addStyles();
  document.querySelector('.excel-preview-overlay')?.remove();
  const overlay=document.createElement('div');overlay.className='excel-preview-overlay';
  const dialog=document.createElement('section');dialog.className='excel-preview-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  const head=document.createElement('div');head.className='excel-preview-head';
  const heading=document.createElement('div');
  const title=document.createElement('h2');title.textContent='مراجعة البيانات قبل التصدير';
  const note=document.createElement('small');note.textContent='اضغط على أي خلية لتعديلها. الصفوف الصفراء منخفضة الثقة.';
  heading.append(title,note);
  const count=document.createElement('small');count.textContent=`${records.length} حركة مستخرجة`;
  head.append(heading,count);
  const scroll=document.createElement('div');scroll.className='excel-preview-scroll';
  const table=document.createElement('table');table.className='excel-preview-table';
  const thead=document.createElement('thead'),headerRow=document.createElement('tr');
  for(const [,label] of FIELDS){const th=document.createElement('th');th.textContent=label;headerRow.appendChild(th)}
  const actionTh=document.createElement('th');actionTh.textContent='حذف';headerRow.appendChild(actionTh);thead.appendChild(headerRow);
  const tbody=document.createElement('tbody');
  records.forEach(record=>{
    const row=document.createElement('tr');if(record.confidence==='منخفض')row.classList.add('low');
    for(const [field] of FIELDS){
      const cell=document.createElement('td');cell.dataset.field=field;cell.contentEditable='true';cell.spellcheck=false;cell.textContent=record[field]??'';row.appendChild(cell);
    }
    const action=document.createElement('td');const del=document.createElement('button');del.type='button';del.className='excel-row-delete';del.textContent='حذف';del.onclick=()=>{row.remove();count.textContent=`${tbody.rows.length} حركة مستخرجة`};action.appendChild(del);row.appendChild(action);tbody.appendChild(row);
  });
  table.append(thead,tbody);scroll.appendChild(table);
  const actions=document.createElement('div');actions.className='excel-preview-actions';
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='primary';exportButton.textContent='اعتماد وتنزيل Excel';
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='danger';cancelButton.textContent='إلغاء';
  const status=document.createElement('span');status.className='excel-preview-status';status.textContent='يمكن تعديل كل الخلايا قبل التنزيل';
  exportButton.onclick=()=>{const edited=collect(table);if(!edited.length){alert('لا توجد صفوف للتصدير');return}onExport?.(edited,fileName);overlay.remove()};
  cancelButton.onclick=()=>overlay.remove();
  overlay.onclick=event=>{if(event.target===overlay)overlay.remove()};
  actions.append(exportButton,cancelButton,status);dialog.append(head,scroll,actions);overlay.appendChild(dialog);document.body.appendChild(overlay);
  setTimeout(()=>table.querySelector('tbody td')?.focus(),0);
}

window.ExplAppExcelPreview={show,collect};
})();