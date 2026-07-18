(()=>{
'use strict';

if(window.PDFStudioUtils)return;

const query=selector=>document.querySelector(selector);
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const csvCell=value=>`"${String(value??'').replace(/"/g,'""')}"`;
const safeName=name=>String(name||'document.pdf').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_');
const median=values=>{
  const sorted=[...values].filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return 0;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};

function normalizeDigits(value){
  return String(value??'')
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/،/g,',').replace(/٫/g,'.').replace(/٬/g,',');
}

function parsePages(value,total,{unique=true}={}){
  const source=normalizeDigits(value).trim();
  if(!source)return Array.from({length:total},(_,index)=>index);
  const pages=[];
  for(const token of source.split(',')){
    const part=token.trim();
    if(!part)continue;
    if(part.includes('-')){
      const [from,to]=part.split('-').map(Number);
      if(!Number.isInteger(from)||!Number.isInteger(to))throw Error('صيغة الصفحات غير صحيحة');
      const step=from<=to?1:-1;
      for(let page=from;step>0?page<=to:page>=to;page+=step){
        if(page>=1&&page<=total)pages.push(page-1);
      }
    }else{
      const page=Number(part);
      if(Number.isInteger(page)&&page>=1&&page<=total)pages.push(page-1);
    }
  }
  if(!pages.length)throw Error('لا توجد صفحات صالحة');
  return unique?[...new Set(pages)]:pages;
}

function arabicDominant(value){
  const text=String(value??'');
  const arabic=(text.match(/[\u0600-\u06ff]/g)||[]).length;
  const latin=(text.match(/[A-Za-z]/g)||[]).length;
  return arabic>latin;
}

function groupRows(items,{yTolerance=0.35,rtl='auto'}={}){
  const normalized=items.map(item=>({
    text:clean(item.text??item.str),
    x:Number(item.x??item.transform?.[4]??0),
    y:Number(item.y??item.transform?.[5]??0),
    width:Number(item.width??item.w??0),
    height:Math.max(1,Math.abs(Number(item.height??item.h??item.transform?.[0]??10)))
  })).filter(item=>item.text);
  normalized.sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const item of normalized){
    const tolerance=Math.max(3,item.height*yTolerance);
    let row=rows.find(candidate=>Math.abs(candidate.y-item.y)<=tolerance);
    if(!row){row={y:item.y,height:item.height,items:[]};rows.push(row)}
    row.items.push(item);
    row.height=Math.max(row.height,item.height);
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>{
    const text=row.items.map(item=>item.text).join(' ');
    const isRtl=rtl==='auto'?arabicDominant(text):Boolean(rtl);
    row.items.sort((a,b)=>isRtl?b.x-a.x:a.x-b.x);
    row.rtl=isRtl;
    row.text=clean(row.items.map(item=>item.text).join(' '));
    return row;
  });
}

function setProgress(percent,message){
  const box=query('#progress'),bar=query('#bar'),msg=query('#msg');
  if(box)box.style.display='block';
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,Number(percent)||0))}%`;
  if(msg)msg.textContent=message||'';
}

function hideProgress(){
  const box=query('#progress');
  if(box)box.style.display='none';
}

function download(data,name,type){
  const blob=data instanceof Blob?data:new Blob([data],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

window.PDFStudioUtils=Object.freeze({
  query,clean,escapeHtml,csvCell,safeName,median,normalizeDigits,parsePages,
  arabicDominant,groupRows,setProgress,hideProgress,download
});
})();