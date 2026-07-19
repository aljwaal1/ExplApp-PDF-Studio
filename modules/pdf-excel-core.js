(()=>{
'use strict';

const arabicDigits=value=>String(value??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const clean=value=>arabicDigits(value).replace(/\s+/g,' ').trim();
const arabicChars=value=>(String(value??'').match(/[\u0600-\u06FF]/g)||[]).length;
const latinChars=value=>(String(value??'').match(/[A-Za-z]/g)||[]).length;
const isRtlRow=row=>{const text=row.map(cell=>cell.text).join(' ');return arabicChars(text)>latinChars(text)};
const logicalCells=row=>[...row].sort((a,b)=>isRtlRow(row)?b.x-a.x:a.x-b.x);
const dateOnlyRx=/^(?:\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})$/;
const normalizeSeparators=value=>{
  let text=clean(value).replace(/[٬،]/g,',').replace(/[٫]/g,'.').replace(/\s+/g,'');
  const comma=text.lastIndexOf(','),dot=text.lastIndexOf('.');
  if(comma>=0&&dot>=0){
    const decimal=Math.max(comma,dot);
    text=[...text].filter((char,index)=>char!==','&&char!=='.'||index===decimal).join('').replace(',', '.');
  }else if(comma>=0){
    const decimals=text.length-comma-1;
    text=decimals===3&&/^[-+()]?\d{1,3}(?:,\d{3})+$/.test(text)?text.replace(/,/g,''):text.replace(',', '.');
  }else if((text.match(/\./g)||[]).length>1){
    const last=text.lastIndexOf('.');
    text=[...text].filter((char,index)=>char!=='.'||index===last).join('');
  }
  return text;
};
const money=value=>{
  const raw=clean(value).toUpperCase();
  if(!raw||dateOnlyRx.test(raw))return'';
  const debit=/\bDR\b|مدين|سحب/.test(raw),credit=/\bCR\b|دائن|إيداع/.test(raw);
  const trailingMinus=/-\s*$/.test(raw),parentheses=/\([^)]*\)/.test(raw);
  const normalized=normalizeSeparators(raw.replace(/\b(?:CR|DR)\b|مدين|دائن|سحب|إيداع/g,' ')).replace(/[^0-9.()+\-]/g,'');
  const numeric=Number(normalized.replace(/[()+\-]/g,'')||NaN);
  if(!Number.isFinite(numeric))return'';
  return parentheses||trailingMinus||debit&&!credit?-numeric:numeric;
};
const dateRx=/(?:\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/;
const chequeRx=/(?:شيك|الشـيك|رقم\s*الشيك|chq|cheque|check)\s*[:#\-]?\s*([A-Z0-9\-\/]{3,})/i;
const referenceRx=/(?:مرجع|المرجع|رقم\s*المستند|مستند|reference|ref)\s*[:#\-]?\s*([A-Z0-9\-\/]{3,})/i;
const debitDirectionRx=/^(?:D|DR|DB|DEBIT|مدين|سحب)$/i;
const creditDirectionRx=/^(?:C|CR|CD|CREDIT|دائن|إيداع|ايداع)$/i;
const normalizeDirection=value=>{const text=clean(value);if(debitDirectionRx.test(text))return'debit';if(creditDirectionRx.test(text))return'credit';return''};
const nonAmountColumnTypes=new Set(['date','cheque','reference','description','direction']);

function safeName(name){return String(name||'bank-statement').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_')}
function groupRows(items){
  const sorted=items.filter(item=>clean(item.str)).map(item=>({text:clean(item.str),x:item.transform?.[4]||0,y:item.transform?.[5]||0,w:item.width||0})).sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const item of sorted){let row=rows.find(candidate=>Math.abs(candidate.y-item.y)<=4);if(!row){row={y:item.y,cells:[]};rows.push(row)}row.cells.push(item)}
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.cells.sort((a,b)=>a.x-b.x));
}
function inferColumns(rows){
  const xs=[];rows.slice(0,40).forEach(row=>row.forEach(cell=>xs.push(cell.x)));xs.sort((a,b)=>a-b);
  const groups=[];
  for(const x of xs){const group=groups.find(candidate=>Math.abs(candidate.x-x)<18);if(group){group.x=(group.x*group.n+x)/(group.n+1);group.n++}else groups.push({x,n:1})}
  return groups.filter(group=>group.n>=2).sort((a,b)=>a.x-b.x).map(group=>group.x);
}
function nearestColumn(x,columns){let best=0,dist=Infinity;columns.forEach((column,index)=>{const current=Math.abs(column-x);if(current<dist){best=index;dist=current}});return best}
const rowText=row=>logicalCells(row).map(cell=>cell.text).join(' ');
const headerKeys=['التاريخ','date','البيان','description','مدين','debit','دائن','credit','المبلغ','amount','الرصيد','balance','شيك','مرجع','نوع الحركة','نوع العملية','transaction type','dr/cr','d/c'];
function headerScore(row){const text=rowText(row).toLowerCase();return headerKeys.filter(key=>text.includes(key)).length}
function detectHeader(rows){return rows.findIndex(row=>headerScore(row)>=2)}
function classifyHeader(text){
  const value=text.toLowerCase();
  if(/تاريخ|date/.test(value))return'date';
  if(/شيك|chq|cheque|check/.test(value))return'cheque';
  if(/مرجع|مستند|reference|ref/.test(value))return'reference';
  if(/بيان|وصف|description|details|narration/.test(value))return'description';
  if(/نوع\s*(?:الحركة|العملية)|transaction\s*type|dr\s*\/\s*cr|d\s*\/\s*c/.test(value))return'direction';
  if(/مدين|debit|سحب/.test(value))return'debit';
  if(/دائن|credit|إيداع/.test(value))return'credit';
  if(/رصيد|balance/.test(value))return'balance';
  if(/مبلغ|قيمة|amount|value/.test(value))return'amount';
  return'';
}
function appendContinuation(record,text){
  if(!record||!text)return false;
  const cheque=(text.match(chequeRx)||[])[1]||'',reference=(text.match(referenceRx)||[])[1]||'';
  record.cheque=record.cheque||cheque;record.reference=record.reference||reference;
  const description=clean(text.replace(chequeRx,'').replace(referenceRx,''));
  if(description)record.description=clean(`${record.description} ${description}`);
  if(record.confidence==='مرتفع')record.confidence='متوسط';
  return true;
}
function isAmountCandidate(cell,map,columns){
  const value=clean(cell.text),type=map[nearestColumn(cell.x,columns)];
  if(nonAmountColumnTypes.has(type))return false;
  if(dateOnlyRx.test(value)||chequeRx.test(value)||referenceRx.test(value)||normalizeDirection(value))return false;
  return money(value)!=='';
}
function buildRecords(rows,pageNo){
  if(!rows.length)return[];
  const headerIndex=detectHeader(rows),dataRows=headerIndex>=0?rows.slice(headerIndex+1):rows;
  if(!dataRows.length)return[];
  let columns=inferColumns(dataRows);
  if(columns.length<3){const all=dataRows.flat(),min=Math.min(...all.map(item=>item.x)),max=Math.max(...all.map(item=>item.x));columns=[min,min+(max-min)*.18,min+(max-min)*.58,min+(max-min)*.75,max]}
  const map={};
  if(headerIndex>=0)rows[headerIndex].forEach(cell=>{const type=classifyHeader(cell.text);if(type)map[nearestColumn(cell.x,columns)]=type});
  const out=[];let leadingContinuation='';
  for(const row of dataRows){
    const text=rowText(row);if(!text||headerScore(row)>=2)continue;
    const hasDate=dateRx.test(text),nums=row.filter(cell=>isAmountCandidate(cell,map,columns)).map(cell=>money(cell.text)).filter(value=>value!==''&&Math.abs(value)<1e15);
    const cheque=(text.match(chequeRx)||[])[1]||'',reference=(text.match(referenceRx)||[])[1]||'';
    if(!hasDate&&nums.length===0&&text.length<160){if(out.length)appendContinuation(out[out.length-1],text);else leadingContinuation=clean([leadingContinuation,text].filter(Boolean).join(' '));continue}
    const record={page:pageNo,date:'',reference,cheque,description:'',amount:'',debit:'',credit:'',balance:'',direction:'',confidence:'متوسط'};
    const buckets={};row.forEach(cell=>{const index=nearestColumn(cell.x,columns);(buckets[index]??=[]).push(cell)});
    for(const [index,cells] of Object.entries(buckets)){
      const value=clean(logicalCells(cells).map(cell=>cell.text).join(' ')),type=map[index];
      if(type==='date')record.date=(value.match(dateRx)||[])[0]||value;
      else if(type==='cheque')record.cheque=record.cheque||value;
      else if(type==='reference')record.reference=record.reference||value;
      else if(type==='description')record.description=value;
      else if(type==='direction')record.direction=normalizeDirection(value);
      else if(['amount','debit','credit','balance'].includes(type))record[type]=money(value);
    }
    if(!record.date)record.date=(text.match(dateRx)||[])[0]||'';
    if(!record.description){const monetaryTokens=row.filter(cell=>money(cell.text)!=='').map(cell=>cell.text);record.description=clean(text.replace(dateRx,'').replace(chequeRx,'').replace(referenceRx,'').split(' ').filter(token=>!monetaryTokens.includes(token)&&!normalizeDirection(token)).join(' '))}
    if(!record.cheque)record.cheque=(record.description.match(chequeRx)||[])[1]||'';
    if(leadingContinuation){appendContinuation(record,leadingContinuation);leadingContinuation=''}
    if(Object.keys(map).length<2){
      const amounts=nums.slice(-3);
      if(amounts.length===3)[record.debit,record.credit,record.balance]=amounts;
      else if(amounts.length===2)[record.amount,record.balance]=amounts;
      else if(amounts.length===1)record.amount=amounts[0];
      record.confidence='منخفض';
    }else record.confidence='مرتفع';
    if(record.amount!==''&&record.direction)record.amount=record.direction==='debit'?-Math.abs(record.amount):Math.abs(record.amount);
    if(record.date||record.description||nums.length)out.push(record);
  }
  if(leadingContinuation&&out.length)appendContinuation(out[out.length-1],leadingContinuation);
  return out;
}
async function extractTextRows(pdf){const records=[];for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo),content=await page.getTextContent();records.push(...buildRecords(groupRows(content.items),pageNo))}return records}
async function extractOcrRows(pdf,lang='ara+eng'){
  if(!window.Tesseract)throw Error('محرك OCR غير متوفر');
  const worker=await Tesseract.createWorker(lang),records=[];
  try{for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result=await worker.recognize(canvas);const items=(result.data.words||[]).map(word=>({str:word.text,transform:[1,0,0,1,word.bbox.x0,canvas.height-word.bbox.y0],width:word.bbox.x1-word.bbox.x0}));records.push(...buildRecords(groupRows(items),pageNo))}}finally{await worker.terminate()}return records;
}
function exportXlsx(records,name){
  if(!records.length)throw Error('لم يتم اكتشاف حركات قابلة للتحويل');
  const rows=records.map(record=>({'الصفحة':record.page,'التاريخ':record.date,'رقم المرجع':record.reference,'رقم الشيك':record.cheque,'البيان':record.description,'المبلغ':record.amount,'مدين':record.debit,'دائن':record.credit,'الرصيد':record.balance,'الثقة':record.confidence}));
  const header=['الصفحة','التاريخ','رقم المرجع','رقم الشيك','البيان','المبلغ','مدين','دائن','الرصيد','الثقة'];
  const sheet=XLSX.utils.json_to_sheet(rows,{header});sheet['!cols']=[8,14,18,16,45,14,14,14,14,10].map(wch=>({wch}));sheet['!views']=[{rightToLeft:true}];
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'كشف البنك');XLSX.writeFile(workbook,`${safeName(name)}-bank.xlsx`);
}
window.ExplAppPdfExcelCore={extractTextRows,extractOcrRows,exportXlsx,buildRecords,groupRows,clean,money};
})();
