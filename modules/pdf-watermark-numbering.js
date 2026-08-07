(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const U=()=>window.PDFStudioUtils;
let active=false;

function ensureStyles(){
  if($('#stampToolStyles'))return;
  const style=document.createElement('style');
  style.id='stampToolStyles';
  style.textContent=`
    .stamp-note{margin-top:10px;padding:10px 12px;border:1px solid #d9e5fa;border-radius:12px;background:#f5f8ff;color:#52627b;font-size:12px;line-height:1.7}
    .stamp-toggle{display:flex;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--l);border-radius:11px;background:#fbfcff;min-height:44px}
    .stamp-toggle input{width:18px;height:18px}.stamp-toggle label{margin:0!important;color:var(--t)!important;font-weight:700}
    .stamp-preview{margin-top:10px;border:1px dashed #b9c8e0;border-radius:13px;padding:12px;text-align:center;background:linear-gradient(135deg,#fff,#f6f8fc);min-height:72px;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .stamp-preview span{display:inline-block;font-size:22px;font-weight:800;color:#667085;opacity:.28;transform:rotate(-28deg);max-width:90%;word-break:break-word}
  `;
  document.head.appendChild(style);
}

function stampOptions(){
  return `<div class="row">
    <div class="field"><label>نص العلامة المائية</label><input id="stampText" type="text" placeholder="مثال: نسخة للمراجعة / CONFIDENTIAL"></div>
    <div class="field"><label>الصفحات</label><input id="stampPages" type="text" placeholder="فارغ = جميع الصفحات، مثال 1-5, 9"></div>
  </div>
  <div class="row">
    <div class="field"><label>شفافية العلامة</label><select id="stampOpacity"><option value="0.12">خفيفة جدًا</option><option value="0.2" selected>خفيفة</option><option value="0.3">متوسطة</option><option value="0.45">واضحة</option></select></div>
    <div class="field"><label>زاوية العلامة</label><select id="stampAngle"><option value="-45">مائلة -45°</option><option value="-30" selected>مائلة -30°</option><option value="0">أفقية</option><option value="30">مائلة +30°</option><option value="45">مائلة +45°</option></select></div>
    <div class="field"><label>موضع العلامة</label><select id="stampPosition"><option value="center" selected>وسط الصفحة</option><option value="top">أعلى الصفحة</option><option value="bottom">أسفل الصفحة</option></select></div>
  </div>
  <div class="row">
    <div class="field"><div class="stamp-toggle"><input id="stampNumbers" type="checkbox" checked><label for="stampNumbers">إضافة أرقام الصفحات</label></div></div>
    <div class="field"><label>بدء الترقيم من</label><input id="stampNumberStart" type="number" min="0" value="1"></div>
    <div class="field"><label>مكان رقم الصفحة</label><select id="stampNumberPosition"><option value="bottom-center" selected>أسفل الوسط</option><option value="bottom-right">أسفل اليمين</option><option value="bottom-left">أسفل اليسار</option><option value="top-center">أعلى الوسط</option></select></div>
  </div>
  <div class="stamp-preview" id="stampTextPreview"><span>معاينة العلامة المائية</span></div>
  <div class="stamp-note">يمكن استخدام العلامة المائية وحدها، أو ترقيم الصفحات وحده، أو الاثنين معًا. يدعم النص العربي لأن العلامة تُرسم محليًا داخل المتصفح قبل إدراجها في PDF.</div>`;
}

function addToolButton(){
  const tools=$('#tools');
  if(!tools||tools.querySelector('[data-tool="stamp"]'))return;
  const button=document.createElement('button');
  button.className='tool';
  button.dataset.tool='stamp';
  button.innerHTML='<b>🪪 علامة مائية وترقيم</b><span>ختم PDF وترقيم الصفحات</span>';
  tools.appendChild(button);
  button.addEventListener('click',event=>{
    event.preventDefault();
    selectTool(button);
  });
}

function selectTool(button){
  const fallback=$('#tools [data-tool="split"]');
  if(fallback&&!active)fallback.click();
  active=true;
  document.querySelectorAll('#tools .tool').forEach(item=>item.classList.toggle('active',item===button));
  const files=$('#files');
  if(files)files.multiple=false;
  const title=$('#dropTitle');if(title)title.textContent='اختر ملف PDF';
  const hint=$('#dropHint');if(hint)hint.textContent='أو اسحب الملف هنا';
  const options=$('#options');
  if(options){options.classList.remove('hidden');options.innerHTML=stampOptions()}
  $('#results').innerHTML='';
  bindPreview();
}

function bindPreview(){
  const text=$('#stampText'),opacity=$('#stampOpacity'),angle=$('#stampAngle'),preview=$('#stampTextPreview span');
  const update=()=>{
    if(!preview)return;
    preview.textContent=(text?.value||'معاينة العلامة المائية').trim()||'معاينة العلامة المائية';
    preview.style.opacity=String(Math.max(.12,Number(opacity?.value||.2)));
    preview.style.transform=`rotate(${Number(angle?.value||-30)}deg)`;
  };
  [text,opacity,angle].forEach(el=>{el?.addEventListener('input',update);el?.addEventListener('change',update)});
  update();
}

function selectedFile(){
  return window.ExplAppSession?.getActiveFile?.()||[...($('#files')?.files||[])][0]||null;
}

function dataUrlBytes(dataUrl){
  const base64=dataUrl.split(',')[1]||'';
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

function isArabic(text){return /[\u0600-\u06ff]/.test(text)}

function watermarkPng(text,angle){
  const fontSize=64;
  const probe=document.createElement('canvas').getContext('2d');
  probe.font=`800 ${fontSize}px Tahoma, Arial, sans-serif`;
  const measured=Math.max(120,Math.ceil(probe.measureText(text).width));
  const baseW=measured+80,baseH=fontSize+70;
  const rad=Math.abs(angle)*Math.PI/180;
  const width=Math.ceil(Math.abs(baseW*Math.cos(rad))+Math.abs(baseH*Math.sin(rad))+30);
  const height=Math.ceil(Math.abs(baseW*Math.sin(rad))+Math.abs(baseH*Math.cos(rad))+30);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.translate(width/2,height/2);ctx.rotate(angle*Math.PI/180);
  ctx.font=`800 ${fontSize}px Tahoma, Arial, sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#4b5563';
  ctx.direction=isArabic(text)?'rtl':'ltr';
  ctx.fillText(text,0,0);
  return dataUrlBytes(canvas.toDataURL('image/png'));
}

function watermarkBox(page,image){
  const pw=page.getWidth(),ph=page.getHeight();
  const targetW=Math.min(pw*.62,Math.max(pw*.28,320));
  const scale=targetW/image.width;
  return {width:targetW,height:image.height*scale,pw,ph};
}

function watermarkPosition(page,image,position){
  const box=watermarkBox(page,image);
  const x=(box.pw-box.width)/2;
  let y=(box.ph-box.height)/2;
  if(position==='top')y=Math.max(24,box.ph-box.height-42);
  if(position==='bottom')y=42;
  return {...box,x,y};
}

function numberCoordinates(page,text,font,size,position){
  const width=font.widthOfTextAtSize(text,size),pw=page.getWidth(),ph=page.getHeight(),margin=24;
  if(position==='bottom-right')return {x:pw-width-margin,y:margin};
  if(position==='bottom-left')return {x:margin,y:margin};
  if(position==='top-center')return {x:(pw-width)/2,y:ph-size-margin};
  return {x:(pw-width)/2,y:margin};
}

async function execute(){
  const file=selectedFile();
  if(!file)throw Error('اختر ملف PDF أولًا');
  const watermark=($('#stampText')?.value||'').trim();
  const numbers=Boolean($('#stampNumbers')?.checked);
  if(!watermark&&!numbers)throw Error('اكتب علامة مائية أو فعّل ترقيم الصفحات');
  const sourceBytes=await file.arrayBuffer();
  const doc=await PDFLib.PDFDocument.load(sourceBytes.slice(0));
  const pages=doc.getPages();
  const selected=U().parsePages($('#stampPages')?.value||'',pages.length);
  const selectedSet=new Set(selected);
  const opacity=Math.max(.03,Math.min(.8,Number($('#stampOpacity')?.value||.2)));
  const angle=Number($('#stampAngle')?.value||-30);
  const position=$('#stampPosition')?.value||'center';
  const numberStart=Math.round(Number($('#stampNumberStart')?.value||1));
  const numberPosition=$('#stampNumberPosition')?.value||'bottom-center';
  let watermarkImage=null,font=null;
  if(watermark)watermarkImage=await doc.embedPng(watermarkPng(watermark,angle));
  if(numbers)font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const list=[...selectedSet].sort((a,b)=>a-b);
  for(let i=0;i<list.length;i++){
    const index=list[i],page=pages[index];
    U().setProgress(8+(i/Math.max(1,list.length))*84,`تجهيز الصفحة ${index+1} من ${pages.length}`);
    if(watermarkImage){
      const box=watermarkPosition(page,watermarkImage,position);
      page.drawImage(watermarkImage,{x:box.x,y:box.y,width:box.width,height:box.height,opacity});
    }
    if(numbers){
      const label=String(numberStart+index);
      const size=10;
      const xy=numberCoordinates(page,label,font,size,numberPosition);
      page.drawText(label,{...xy,size,font,opacity:.82});
    }
  }
  const result=await doc.save({useObjectStreams:true});
  U().download(result,`${U().safeName(file.name)}-watermark-numbered.pdf`,'application/pdf');
  U().setProgress(100,'تمت إضافة العلامة المائية والترقيم');
  setTimeout(()=>U().hideProgress(),1100);
  const out=$('#results');
  if(out)out.innerHTML=`<div class="result"><b>تم تجهيز الملف بنجاح</b><small>${watermark?'علامة مائية مضافة':''}${watermark&&numbers?' • ':''}${numbers?'تم ترقيم الصفحات':''} • ${list.length} صفحة تمت معالجتها</small></div>`;
}

function bindRun(){
  const run=$('#run');
  if(!run||run.dataset.stampBound)return;
  run.dataset.stampBound='1';
  run.addEventListener('click',async event=>{
    if(!document.querySelector('#tools [data-tool="stamp"].active'))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run.disabled=true;$('#results').innerHTML='';U().setProgress(3,'بدء إضافة العلامة المائية والترقيم…');await execute()}
    catch(error){console.error(error);U()?.hideProgress();alert(error.message||'تعذر معالجة الملف')}
    finally{run.disabled=false}
  },true);
}

function keepActiveState(){
  const tools=$('#tools');
  tools?.addEventListener('click',event=>{
    const button=event.target.closest('[data-tool]');
    if(button?.dataset.tool!=='stamp')active=false;
  },true);
}

function init(){ensureStyles();addToolButton();bindRun();keepActiveState()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
