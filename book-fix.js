'use strict';

async function resolveOutlinePage(item){
  try{
    const dest=typeof item.dest==='string'?await doc.getDestination(item.dest):item.dest;
    if(!dest||!dest[0])return null;
    return (await doc.getPageIndex(dest[0]))+1;
  }catch{return null}
}

async function outlineStarts(){
  const outline=await doc.getOutline();
  if(!outline||!outline.length)return [];
  const top=[];
  for(const item of outline){
    const p=await resolveOutlinePage(item);
    if(p)top.push({p,x:(item.title||'فصل').trim(),source:'bookmark'});
  }
  if(top.length>=2)return top;
  const flat=[];
  async function walk(list){
    for(const item of list||[]){
      const p=await resolveOutlinePage(item);
      if(p)flat.push({p,x:(item.title||'فصل').trim(),source:'bookmark'});
      if(item.items?.length)await walk(item.items);
    }
  }
  await walk(outline);
  return flat;
}

async function textHeadingStarts(){
  let re;
  try{re=new RegExp($('#headPat').value,'i')}catch{throw Error('صيغة كلمات العناوين غير صحيحة')}
  const pagesFound=[];
  for(let n=1;n<=doc.numPages;n++){
    prog(n/doc.numPages*74,`فحص عناوين الصفحة ${n}`);
    const page=await doc.getPage(n),height=page.getViewport({scale:1}).height;
    const pageRows=rows(await items(doc,n));
    const matches=[];
    for(const r of pageRows){
      const x=r.map(z=>z.s).join(' ').replace(/\s+/g,' ').trim();
      if(!x||x.length>150||!re.test(x))continue;
      const size=Math.max(...r.map(z=>z.h||0));
      const y=Math.max(...r.map(z=>z.y||0));
      matches.push({p:n,x,size,y,top:y>height*.55});
    }
    if(matches.length)pagesFound.push({p:n,matches});
  }
  const clean=pagesFound.filter(x=>x.matches.length<=3);
  const starts=[];
  for(const pg of clean){
    const sorted=[...pg.matches].sort((a,b)=>Number(b.top)-Number(a.top)||b.size-a.size||a.x.length-b.x.length);
    const best=sorted[0];
    if(best)starts.push({...best,source:'text'});
  }
  return starts;
}

function normalizeChapterStarts(list){
  const byPage=new Map();
  for(const x of list.sort((a,b)=>a.p-b.p))if(!byPage.has(x.p))byPage.set(x.p,x);
  return [...byPage.values()].sort((a,b)=>a.p-b.p);
}

async function extractChapterRange(start,end,title){
  const count=end-start+1;
  if(count<1)throw Error('نطاق الفصل غير صالح');
  prog(10,`استخراج الصفحات ${start}-${end}`);
  const src=await PDFLib.PDFDocument.load(bytes.slice(0));
  const out=await PDFLib.PDFDocument.create();
  const ids=Array.from({length:count},(_,i)=>start-1+i);
  const copied=await out.copyPages(src,ids);
  copied.forEach(p=>out.addPage(p));
  dl(await out.save(),`${safeName(title)}-pages-${start}-${end}.pdf`,'application/pdf');
  prog(100,`تم استخراج ${count} صفحة`);
  setTimeout(hideProg,1000);
}

book=async function(){
  OUT.innerHTML='';
  prog(3,'قراءة فهرس الكتاب…');
  let starts=normalizeChapterStarts(await outlineStarts());
  let source='الإشارات المرجعية داخل PDF';
  if(starts.length<2){
    starts=normalizeChapterStarts(await textHeadingStarts());
    source='العناوين المكتشفة داخل الصفحات';
  }
  if(!starts.length){
    OUT.innerHTML='<div class="result">لم يتم اكتشاف وحدات أو فصول. أضف كلمة مستخدمة في عنوان الفصل، مثل: Module أو Topic.</div>';
    return;
  }
  const note=document.createElement('div');
  note.className='result';
  note.textContent=`تم الاعتماد على ${source}. اختر أي نتيجة لاستخراج جميع صفحاتها.`;
  OUT.appendChild(note);
  for(let i=0;i<starts.length;i++){
    const current=starts[i],next=starts[i+1],end=next?next.p-1:doc.numPages,count=end-current.p+1;
    if(count<1)continue;
    const card=document.createElement('div');card.className='result';
    const title=document.createElement('b');title.textContent=current.x||`الفصل ${i+1}`;
    const badge=document.createElement('span');badge.className='badge';badge.textContent=`${count} صفحة`;
    const meta=document.createElement('small');meta.textContent=`الفصل كاملًا: من الصفحة ${current.p} إلى الصفحة ${end}`;
    const actions=document.createElement('div');actions.className='result-actions';
    const extract=document.createElement('button');extract.className='primary';extract.textContent='استخراج الفصل كاملًا';
    const preview=document.createElement('button');preview.className='secondary';preview.textContent='معاينة صفحة البداية';
    const previewBox=document.createElement('div');previewBox.className='preview hidden';
    extract.onclick=()=>extractChapterRange(current.p,end,current.x||`chapter-${i+1}`);
    preview.onclick=async()=>{previewBox.classList.remove('hidden');await renderPreview(current.p,previewBox)};
    actions.append(extract,preview);card.append(title,badge,meta,actions,previewBox);OUT.appendChild(card);
  }
};
