(()=>{
'use strict';

const core=window.ExplAppPdfExcelCore;
if(!core||typeof core.exportXlsx!=='function'||!window.XLSX)return;

const arabicIndicDigits='٠١٢٣٤٥٦٧٨٩';
const easternArabicDigits='۰۱۲۳۴۵۶۷۸۹';

function normalizeIdentifierDigits(value){
  return String(value)
    .replace(/[٠-٩]/g,d=>String(arabicIndicDigits.indexOf(d)))
    .replace(/[۰-۹]/g,d=>String(easternArabicDigits.indexOf(d)));
}

function asIdentifierText(value){
  if(value===null||value===undefined)return'';
  return normalizeIdentifierDigits(value)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .replace(/[\u00a0\s]+/g,' ')
    .trim();
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

function finiteNumber(value){
  if(value===''||value===null||value===undefined)return 0;
  const number=Number(value);
  return Number.isFinite(number)?number:0;
}

function hasFiniteNumber(value){
  if(value===''||value===null||value===undefined)return false;
  return Number.isFinite(Number(value));
}

function signedTransactionAmount(record){
  if(hasFiniteNumber(record.amount))return Number(record.amount);
  const hasDebit=hasFiniteNumber(record.debit);
  const hasCredit=hasFiniteNumber(record.credit);
  if(!hasDebit&&!hasCredit)return'';
  const debit=hasDebit?Math.abs(Number(record.debit)):0;
  const credit=hasCredit?Math.abs(Number(record.credit)):0;
  return credit-debit;
}

function statementSummary(records){
  const summary={transactions:records.length,totalDebit:0,totalCredit:0,netAmount:0,closingBalance:'',lowConfidence:0};
  for(const record of records){
    summary.totalDebit+=Math.abs(finiteNumber(record.debit));
    summary.totalCredit+=Math.abs(finiteNumber(record.credit));
    summary.netAmount+=finiteNumber(signedTransactionAmount(record));
    if(record.balance!==''&&Number.isFinite(Number(record.balance)))summary.closingBalance=Number(record.balance);
    if(record.confidence==='منخفض')summary.lowConfidence++;
  }
  return summary;
}

function createSummarySheet(records){
  const summary=statementSummary(records);
  const rows=[
    ['ملخص كشف البنك','القيمة'],
    ['عدد الحركات',summary.transactions],
    ['إجمالي المدين',summary.totalDebit],
    ['إجمالي الدائن',summary.totalCredit],
    ['صافي الحركة',summary.netAmount],
    ['الرصيد الختامي',summary.closingBalance],
    ['حركات تحتاج مراجعة',summary.lowConfidence]
  ];
  const sheet=XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols']=[{wch:24},{wch:18}];
  sheet['!views']=[{rightToLeft:true}];
  for(let row=3;row<=6;row++){const cell=sheet[`B${row}`];if(cell)cell.z='#,##0.00;[Red]-#,##0.00'}
  sheet['!autofilter']={ref:'A1:B7'};
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
    'المبلغ':signedTransactionAmount(record),
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
  sheet['!autofilter']={ref:`A1:J${rows.length+1}`};
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,createSummarySheet(records),'الملخص');
  XLSX.utils.book_append_sheet(workbook,sheet,'كشف البنك');
  const safeName=String(name||'bank-statement').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');
  XLSX.writeFile(workbook,`${safeName}-bank.xlsx`);
}

core.exportXlsx=exportXlsx;
core.asIdentifierText=asIdentifierText;
core.preserveIdentifierColumns=preserveIdentifierColumns;
core.signedTransactionAmount=signedTransactionAmount;
core.statementSummary=statementSummary;
core.createSummarySheet=createSummarySheet;
})();
