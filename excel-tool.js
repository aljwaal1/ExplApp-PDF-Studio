(()=>{
  'use strict';

  function init(){
    const tools=document.querySelector('.tools');
    if(!tools)return;

    // إزالة أداة المقارنة حسب طلب المستخدم.
    const compareButton=tools.querySelector('[data-t="compare"]');
    if(compareButton)compareButton.remove();

    // منع تكرار الإضافة بعد تحديثات PWA.
    if(tools.querySelector('[data-excel-entry="true"]'))return;

    const tablesButton=tools.querySelector('[data-t="tables"]');
    if(!tablesButton)return;

    const excelButton=document.createElement('button');
    excelButton.type='button';
    excelButton.className='tool';
    excelButton.dataset.excelEntry='true';
    excelButton.innerHTML='<b>📗 PDF إلى Excel</b><span>جداول عربية وبيانات مالية</span>';

    excelButton.addEventListener('click',()=>{
      // نستخدم محرك الجداول الحالي مع فرض إخراج Excel.
      tablesButton.click();
      const format=document.querySelector('#tableFmt');
      if(format)format.value='xlsx';

      document.querySelectorAll('.tool').forEach(button=>button.classList.remove('active'));
      excelButton.classList.add('active');

      const title=document.querySelector('#dropTitle');
      const hint=document.querySelector('#dropHint');
      if(title)title.textContent='اختر ملف PDF لتحويله إلى Excel';
      if(hint)hint.textContent='يدعم العربية والجداول المالية النصية — المعالجة محلية';
    });

    tools.insertBefore(excelButton,tablesButton);

    // توضيح وظيفة زر الجداول بعد فصل أداة Excel عنه.
    const span=tablesButton.querySelector('span');
    if(span)span.textContent='اكتشاف ومعاينة الجداول';
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
