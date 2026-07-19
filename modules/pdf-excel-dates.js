(()=>{
'use strict';

const core=window.ExplAppPdfExcelCore;
if(!core||core.__dateNormalizationInstalled)return;

const arabicDigits=value=>String(value??'')
 .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
 .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const stripBidi=value=>arabicDigits(value).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
const compactDateSeparators=value=>stripBidi(value).replace(/\s*([/.-])\s*/g,'$1').replace(/\s+/g,' ').trim();
const dateRx=/(?:\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b|\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b)/;
const dateLabelRx=/(?:تاريخ(?:\s*الحركة)?|date)\s*[:#-]?\s*/ig;

function normalizeDate(value){
 const compact=compactDateSeparators(value).replace(dateLabelRx,'');
 const match=compact.match(dateRx);
 return match?match[0]:'';
}

function normalizeRecordDate(record){
 if(!record||typeof record!=='object')return record;
 const current=normalizeDate(record.date);
 const description=compactDateSeparators(record.description);
 const fallback=normalizeDate(description);
 record.date=current||fallback||String(record.date??'').trim();
 if(fallback&&record.description){
  record.description=description.replace(dateLabelRx,'').replace(fallback,'').replace(/\s+/g,' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g,'').trim();
 }
 return record;
}

function normalizeRecords(records){
 return Array.isArray(records)?records.map(normalizeRecordDate):records;
}

for(const method of ['extractTextRows','extractOcrRows']){
 const original=core[method];
 if(typeof original!=='function')continue;
 core[method]=async function(...args){return normalizeRecords(await original.apply(this,args))};
}

core.normalizeDate=normalizeDate;
core.normalizeRecordDate=normalizeRecordDate;
core.normalizeRecordDates=normalizeRecords;
core.__dateNormalizationInstalled=true;
})();
