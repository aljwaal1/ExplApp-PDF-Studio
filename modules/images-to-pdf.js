(()=>{
'use strict';
let active=false;
let imageFiles=[];

const $=selector=>document.querySelector(selector);
const isImage=file=>file&&(/^image\//.test(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name));
const safeName=value=>String(value||'images').replace(/[\\/:*?"<>|]/g,'_');

function addStyles(){
 if($('#imagesPdfStyles'))return;
 const style=document.createElement('style');
 style.id='imagesPdfStyles';
 style.textContent=`
 .images-pdf-list{display:grid;gap:8px;margin-top:10px}
 .images-pdf-item{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;border:1px solid var(--l);border-radius:12px;padding:8px;background:#fbfcff}
 .images-pdf-item img{width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--l)}
 .images-pdf-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.images-pdf-item small{color:var(--m)}
 .images-pdf-controls{display:flex;gap:5px}.images-pdf-controls button{padding:6px 9px;min-width:34px}
 @media(max-width:620px){.images-pdf-item{grid-template-columns:44px 1fr}.images-pdf-item img{width:44px;height:44px}.images-pdf-controls{grid-column:1/-1}.images-pdf-controls button{flex:1}}
 `;
 document.head.appendChild(style);
}

function optionsHtml(){
 return `<div class="row">
  <div class="field"><label>حجم الصفحة</label><select id="imagePdfPage"><option value="auto">حسب حجم كل صورة</option><option value="a4">A4</option><option value="letter">Letter</option></select></div>
  <div class="field"><label>اتجاه الصفحة</label><select id="imagePdfOrientation"><option value="auto">تلقائي</option><option value="portrait">عمودي</option><option value="landscape">أفقي</option></select></div>
  <div class="field"><label>الهامش</label><select id="imagePdfMargin"><option value="24">صغير</option><option value="42" selected>متوسط</option><option value="72">كبير</option><option value="0">بدون هامش</option></select></div>
 </div><div class="note">يمكن ترتيب الصور قبل التحويل. تدعم JPG وPNG وWebP، وتبقى المعالجة على جهازك.</div><div id="imagesPdfList" class="images-pdf-list"></div>`;
}

function revokePreviews(){
 document.querySelectorAll('.images-pdf-item img[data-url]').forEach(img=>URL.revokeObjectURL(img.dataset.url));
}

function renderList(){
 const list=$('#imagesPdfList');
 if(!list)return;
 revokePreviews();
 list.innerHTML='';
 imageFiles.forEach((file,index)=>{
  const row=document.createElement('div');row.className='images-pdf-item';
  const img=document.createElement('img');const url=URL.createObjectURL(file);img.src=url;img.dataset.url=url;img.alt='';
  const info=document.createElement('div');const name=document.createElement('strong');name.textContent=file.name;const size=document.createElement('small');size.textContent=`${(file.size/1048576).toFixed(2)} MB`;info.append(name,size);
  const controls=document.createElement('div');controls.className='images-pdf-controls';
  const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='تحريك للأعلى';up.disabled=index===0;up.onclick=()=>{[imageFiles[index-1],imageFiles[index]]=[imageFiles[index],imageFiles[index-1]];renderList()};
  const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='تحريك للأسفل';down.disabled=index===imageFiles.length-1;down.onclick=()=>{[imageFiles[index+1],imageFiles[index]]=[imageFiles[index],imageFiles[index+1]];renderList()};
  const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='حذف';remove.onclick=()=>{imageFiles.splice(index,1);renderList();updateState()};
  controls.append(up,down,remove);row.append(img,info,controls);list.appendChild(row);
 });
}

function updateState(){
 const info=$('#info'),run=$('#run');
 if(info){info.style.display=imageFiles.length?'block':'none';info.textContent=imageFiles.length?`تم اختيار ${imageFiles.length} صورة — اسحب أو اختر صورًا أخرى للإضافة`:''}
 if(run)run.disabled=!imageFiles.length;
}

function addFiles(files){
 const incoming=[...files].filter(isImage);
 if(!incoming.length){alert('اختر صور JPG أو PNG أو WebP');return}
 imageFiles.push(...incoming);renderList();updateState();
}

async function imageInfo(file){
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error(`تعذر قراءة الصورة: ${file.name}`));img.src=url});
  return {width:image.naturalWidth,height:image.naturalHeight,image};
 }finally{URL.revokeObjectURL(url)}
}

async function asPngBytes(file){
 if(file.type==='image/png'||/\.png$/i.test(file.name))return new Uint8Array(await file.arrayBuffer());
 const {width,height,image}=await imageInfo(file);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
 if(!blob)throw Error(`تعذر تحويل الصورة: ${file.name}`);
 return new Uint8Array(await blob.arrayBuffer());
}

function pageDimensions(mode,orientation,width,height){
 let dimensions;
 if(mode==='a4')dimensions=[595.28,841.89];else if(mode==='letter')dimensions=[612,792];else dimensions=[Math.max(72,width),Math.max(72,height)];
 const shouldLandscape=orientation==='landscape'||(orientation==='auto'&&width>height);
 if(orientation==='portrait'||(!shouldLandscape&&dimensions[0]>dimensions[1]))dimensions=[Math.min(...dimensions),Math.max(...dimensions)];
 else if(shouldLandscape&&dimensions[0]<dimensions[1])dimensions=[dimensions[1],dimensions[0]];
 return dimensions;
}

async function buildPdf(){
 if(!imageFiles.length)throw Error('اختر صورة واحدة على الأقل');
 const output=await PDFLib.PDFDocument.create();
 const mode=$('#imagePdfPage')?.value||'auto',orientation=$('#imagePdfOrientation')?.value||'auto',margin=Number($('#imagePdfMargin')?.value||42);
 for(let index=0;index<imageFiles.length;index++){
  const file=imageFiles[index];
  if(typeof prog==='function')prog((index/imageFiles.length)*90,`إضافة الصورة ${index+1} من ${imageFiles.length}`);
  const {width,height}=await imageInfo(file);
  let embedded;
  if(file.type==='image/jpeg'||/\.jpe?g$/i.test(file.name))embedded=await output.embedJpg(await file.arrayBuffer());
  else embedded=await output.embedPng(await asPngBytes(file));
  const [pageWidth,pageHeight]=pageDimensions(mode,orientation,width,height);const page=output.addPage([pageWidth,pageHeight]);
  const availableWidth=Math.max(1,pageWidth-margin*2),availableHeight=Math.max(1,pageHeight-margin*2);const scale=Math.min(availableWidth/embedded.width,availableHeight/embedded.height);const drawWidth=embedded.width*scale,drawHeight=embedded.height*scale;
  page.drawImage(embedded,{x:(pageWidth-drawWidth)/2,y:(pageHeight-drawHeight)/2,width:drawWidth,height:drawHeight});
 }
 const bytes=await output.save();const base=safeName(imageFiles[0]?.name.replace(/\.[^.]+$/,'')||'images');
 if(typeof download==='function')download(bytes,`${base}-${imageFiles.length}-images.pdf`,'application/pdf');
 if(typeof prog==='function'){prog(100,'تم إنشاء PDF');setTimeout(()=>typeof hideProg==='function'&&hideProg(),900)}
}

function activate(button){
 active=true;imageFiles=[];document.querySelectorAll('.tool').forEach(item=>item.classList.toggle('active',item===button));
 const input=$('#files');input.value='';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;
 $('#dropTitle').textContent='اختر صورة أو عدة صور';$('#dropHint').textContent='JPG أو PNG أو WebP — ويمكن ترتيبها قبل التحويل';$('#options').innerHTML=optionsHtml();$('#results').innerHTML='';$('#preview').style.display='none';updateState();
}

function deactivate(){if(!active)return;active=false;imageFiles=[];revokePreviews();const input=$('#files');if(input){input.accept='application/pdf';input.value=''} }

function init(){
 addStyles();const tools=$('.tools');if(!tools||tools.querySelector('[data-image-pdf-entry]'))return;
 const button=document.createElement('button');button.type='button';button.className='tool';button.dataset.imagePdfEntry='true';button.innerHTML='<b>🖼️ صور إلى PDF</b><span>ترتيب عدة صور وتحويلها</span>';button.onclick=event=>{event.stopImmediatePropagation();activate(button)};
 const imagesButton=tools.querySelector('[data-tool="images"]');tools.insertBefore(button,imagesButton||null);
 tools.addEventListener('click',event=>{const selected=event.target.closest('.tool');if(selected&&selected!==button&&!selected.dataset.imagePdfEntry)deactivate()},true);
 const input=$('#files');input.addEventListener('change',event=>{if(!active)return;event.stopImmediatePropagation();event.preventDefault();addFiles(event.target.files);event.target.value=''},true);
 const drop=$('#drop');drop.addEventListener('drop',event=>{if(!active)return;event.preventDefault();event.stopImmediatePropagation();drop.classList.remove('drag');addFiles(event.dataTransfer.files)},true);
 $('#run').addEventListener('click',async event=>{if(!active)return;event.preventDefault();event.stopImmediatePropagation();const run=$('#run');try{run.disabled=true;await buildPdf()}catch(error){alert(error.message||'تعذر إنشاء PDF')}finally{run.disabled=!imageFiles.length}},true);
 $('#reset').addEventListener('click',event=>{if(!active)return;event.stopImmediatePropagation();imageFiles=[];revokePreviews();$('#options').innerHTML=optionsHtml();updateState()},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();