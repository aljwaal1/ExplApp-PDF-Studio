(()=>{
'use strict';

if(window.PDFStudioUtils)return;

const query=selector=>document.querySelector(selector);
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const csvCell=value=>`"${String(value??'').replace(/"/g,'""')}"`;

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
  const url=URL.createObjectURL(new Blob([data],{type}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

window.PDFStudioUtils=Object.freeze({
  query,
  clean,
  escapeHtml,
  csvCell,
  setProgress,
  hideProgress,
  download
});
})();
