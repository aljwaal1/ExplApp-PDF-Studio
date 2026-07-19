(()=>{
'use strict';

const core=window.ExplAppPdfExcelCore;
if(!core||typeof core.exportXlsx!=='function'||!window.XLSX)return;

function asIdentifierText(value){
  if(value===null||value===undefined)return'';
  return String(value).trim();
}

function preserveIdentifierColumns(sheet,rowCount){
  for(let row=2;row<=rowCount+1;row++){
    for(const column of ['C','D']){
      const address=`${column}${row}`;
      const cell=sheet[address];
      if(!cell)continue;
      cell.v=asIdentifierText(cell.v);
      cell.t='s';
      cell.z='@';
    }
  }
  return sheet;
}

function exportXlsx(records,name){
  if(!records.length)throw Error('لم يتم اكتشاف حركات قابلة للتحويل');
  const rows=records.map(record=>({
    'الصفحة':record.page,
    'التاريخ':record.date,
    'رقم المرجع':asIdentifierText(record.reference),
    'رقم الشيك':asIdentifierText(record.cheque),
    'البيان':record.description,
    'المبلغ':record.amount,
    'مدين':record.debit,
    'دائن':record.credit,
    'الرصيد':record.balance,
    'الثقة':record.confidence
  }));
  const header=['الصفحة','التاريخ','رقم المرجع','رقم الشيك','البيان','المبلغ','مدين','دائن','الرصيد','الثقة'];
  const sheet=XLSX.utils.json_to_sheet(rows,{header});
  preserveIdentifierColumns(sheet,rows.length);
  sheet['!cols']=[8,14,18,16,45,14,14,14,14,10].map(wch=>({wch}));
  sheet['!views']=[{rightToLeft:true}];
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,sheet,'كشف البنك');
  const safeName=String(name||'bank-statement').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');
  XLSX.writeFile(workbook,`${safeName}-bank.xlsx`);
}

core.exportXlsx=exportXlsx;
core.asIdentifierText=asIdentifierText;
core.preserveIdentifierColumns=preserveIdentifierColumns;
})();