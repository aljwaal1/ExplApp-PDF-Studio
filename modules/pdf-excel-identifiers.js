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

function parseLocalizedNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(value===''||value===null||value===undefined)return null;
  let text=normalizeIdentifierDigits(value)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .replace(/[\u00a0\s]/g,'')
    .replace(/−/g,'-');
  let negative=false;
  if(/^\(.*\)$/.test(text)){
    negative=true;
    text=text.slice(1,-1);
  }
  if(/(?:CR|دائن)$/i.test(text))text=text.replace(/(?:CR|دائن)$/i,'');
  if(/(?:DR|مدين)$/i.test(text)){
    negative=true;
    text=text.replace(/(?:DR|مدين)$/i,'');
  }
  text=text.replace(/٬/g,',').replace(/٫/g,'.');
  const lastComma=text.lastIndexOf(',');
  const lastDot=text.lastIndexOf('.');
  if(lastComma>-1&&lastDot>-1){
    const decimalIndex=Math.max(lastComma,lastDot);
    text=text.slice(0,decimalIndex).replace(/[.,]/g,'')+'.'+text.slice(decimalIndex+1).replace(/[.,]/g,'');
  }else if(lastComma>-1){
    const decimals=text.length-lastComma-1;
    text=decimals>0&&decimals<=2
      ?text.slice(0,lastComma).replace(/,/g,'')+'.'+text.slice(lastComma+1)
      :text.replace(/,/g,'');
  }else if(lastDot>-1){
    const groupedThousands=/^[-+]?\d{1,3}(?:\.\d{3})+$/;
    if(groupedThousands.test(text))text=text.replace(/\./g,'');
  }
  text=text.replace(/[^0-9+.-]/g,'');
  if(!/^[-+]?\d+(?:\.\d+)?$/.test(text))return null;
  const number=Number(text);
  if(!Number.isFinite(number))return null;
  return negative?-Math.abs(number):number;
}

function finiteNumber(value){
  const number=parseLocalizedNumber(value);
  return number===null?0:number;
}

function hasFiniteNumber(value){
  return parseLocalizedNumber(value)!==null;
}

function numericOrBlank(value){
  const number=parseLocalizedNumber(value);
  return number===null?'':number;
}

function signedTransactionAmount(record){
  const amount=parseLocalizedNumber(record.amount);
  if(amount!==null)return amount;
  const debit=parseLocalizedNumber(record.debit);
  const credit=parseLocalizedNumber(record.credit);
  if(debit===null&&credit===null)return'';
  return Math.abs(credit||0)-Math.abs(debit||0);
}

function statementSummary(records){
  const summary={transactions:records.length,totalDebit:0,totalCredit:0,netAmount:0,closingBalance:'',lowConfidence:0};
  for(const record of records){
    summary.totalDebit+=Math.abs(finiteNumber(record.debit));
    summary.totalCredit+=Math.abs(finiteNumber(record.credit));
    summary.netAmount+=finiteNumber(signedTransactionAmount(record));
    const balance=parseLocalizedNumber(record.balance);
    if(balance!==null)summary.closingBalance=balance;
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
  for(let row=3;row<=6;row++){
    const cell=sheet[`B${row}`];
    if(cell)cell.z='#,##0.00;[Red]-#,##0.00';
  }
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
    'مدين':numericOrBlank(record.debit),
    'دائن':numericOrBlank(record.credit),
    'الرصيد':numericOrBlank(record.balance),
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
core.parseLocalizedNumber=parseLocalizedNumber;
core.signedTransactionAmount=signedTransactionAmount;
core.statementSummary=statementSummary;
core.createSummarySheet=createSummarySheet;
})();
