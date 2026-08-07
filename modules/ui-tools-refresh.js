(()=>{
'use strict';

const $=selector=>document.querySelector(selector);
const GROUPS={
  split:'تحرير',merge:'تحرير',organize:'تحرير',blank:'تحرير',stamp:'تحرير',
  search:'قراءة',compare:'قراءة',book:'قراءة',
  txt:'تحويل',md:'تحويل',word:'تحويل',images:'تحويل',tables:'تحويل',ocr:'تحويل',batch:'تحويل'
};

function ensureStyles(){
  if($('#toolsRefreshStyles'))return;
  const style=document.createElement('style');
  style.id='toolsRefreshStyles';
  style.textContent=`
    .tools-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:14px 0 10px;flex-wrap:wrap}
    .tools-search-wrap{position:relative;flex:1;min-width:240px}.tools-search-wrap input{width:100%;padding:12px 42px 12px 12px;border:1px solid var(--l);border-radius:14px;background:#fff;box-shadow:0 6px 20px #1b3a7620;outline:none;transition:.18s ease}
    .tools-search-wrap input:focus{border-color:#8ba7e6;box-shadow:0 0 0 4px #2859d814,0 8px 22px #1b3a7617}
    .tools-search-wrap:before{content:'🔎';position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none}
    .tools-count{font-size:12px;color:var(--m);background:#fff;border:1px solid var(--l);padding:9px 12px;border-radius:999px;white-space:nowrap}
    #tools.tools{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:0}
    #tools .tool{position:relative;overflow:hidden;min-height:92px;border:1px solid #d9e2f1;border-radius:18px;padding:15px 15px 13px;background:linear-gradient(180deg,#fff,#f8faff);box-shadow:0 7px 18px #19386b0d;transition:.18s ease;isolation:isolate}
    #tools .tool:before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:#d8e1ef;transition:.18s ease}
    #tools .tool:hover{transform:translateY(-2px);border-color:#9fb4e5;box-shadow:0 12px 28px #19386b1a}
    #tools .tool:focus-visible{outline:none;box-shadow:0 0 0 4px #2859d824,0 12px 28px #19386b1a}
    #tools .tool.active{background:linear-gradient(135deg,#2859d8,#5f7fe8);border-color:#2859d8;color:#fff;box-shadow:0 14px 32px #2859d83b;transform:translateY(-1px)}
    #tools .tool.active:before{background:#fff8}
    #tools .tool b{font-size:14px;line-height:1.45;display:block;margin-bottom:8px}
    #tools .tool span{font-size:11px;line-height:1.45;color:#6b7280}
    #tools .tool.active span{color:#eef3ff}
    #tools .tool[data-group]:after{content:attr(data-group);position:absolute;left:10px;top:9px;font-size:9px;font-weight:800;padding:3px 6px;border-radius:999px;background:#edf2fb;color:#5d6b82}
    #tools .tool.active[data-group]:after{background:#ffffff26;color:#fff}
    #tools .tool.tool-hidden{display:none!important}
    .tool-empty-search{display:none;text-align:center;color:var(--m);font-size:12px;padding:12px;border:1px dashed var(--l);border-radius:13px;background:#fff}
    .tool-empty-search.show{display:block}
    .panel button:not(.tool),header button{transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease,opacity .14s ease;box-shadow:0 5px 14px #17203312}
    .panel button:not(.tool):hover:not(:disabled),header button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 20px #1720331c}
    .panel button:not(.tool):active:not(:disabled),header button:active:not(:disabled){transform:translateY(0) scale(.985)}
    .panel button:not(.tool):focus-visible,header button:focus-visible{outline:none;box-shadow:0 0 0 4px #2859d824,0 7px 18px #17203318}
    .panel button.primary{background:linear-gradient(135deg,#2859d8,#4b70df);box-shadow:0 8px 20px #2859d82c}
    .panel button.danger{border:1px solid #ffd4d1;background:#fff6f5}.panel button:disabled{opacity:.48;cursor:not-allowed;box-shadow:none;transform:none}
    @media(max-width:620px){
      .tools-toolbar{display:block}.tools-count{display:inline-block;margin-top:8px}.tools-search-wrap{min-width:0}
      #tools.tools{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #tools .tool{min-height:88px;padding:12px 11px;border-radius:15px}
      #tools .tool b{font-size:12px;padding-left:32px}.tools-search-wrap input{font-size:14px}
    }
  `;
  document.head.appendChild(style);
}

function ensureToolbar(){
  const tools=$('#tools');
  if(!tools||$('#toolsToolbar'))return;
  const toolbar=document.createElement('div');
  toolbar.id='toolsToolbar';
  toolbar.className='tools-toolbar';
  toolbar.innerHTML=`<div class="tools-search-wrap"><input id="toolsSearch" type="search" placeholder="ابحث عن أداة: تقسيم، OCR، Word، Chapter…" autocomplete="off"></div><div class="tools-count" id="toolsCount"></div>`;
  tools.insertAdjacentElement('beforebegin',toolbar);
  const empty=document.createElement('div');
  empty.id='toolsEmptySearch';
  empty.className='tool-empty-search';
  empty.textContent='لم يتم العثور على أداة مطابقة.';
  tools.insertAdjacentElement('afterend',empty);
}

function normalize(value){
  return String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
}

function decorateTools(){
  document.querySelectorAll('#tools .tool[data-tool]').forEach(button=>{
    const tool=button.dataset.tool;
    button.dataset.group=GROUPS[tool]||'أخرى';
    button.setAttribute('aria-pressed',button.classList.contains('active')?'true':'false');
  });
}

function updateCount(){
  const buttons=[...document.querySelectorAll('#tools .tool[data-tool]')];
  const visible=buttons.filter(button=>!button.classList.contains('tool-hidden')).length;
  const count=$('#toolsCount');
  if(count)count.textContent=`${visible} أداة متاحة`;
  $('#toolsEmptySearch')?.classList.toggle('show',visible===0);
}

function bindSearch(){
  const input=$('#toolsSearch');
  if(!input||input.dataset.bound)return;
  input.dataset.bound='1';
  input.addEventListener('input',()=>{
    const q=normalize(input.value);
    document.querySelectorAll('#tools .tool[data-tool]').forEach(button=>{
      const hay=normalize(`${button.textContent} ${button.dataset.tool} ${button.dataset.group}`);
      button.classList.toggle('tool-hidden',Boolean(q)&&!hay.includes(q));
    });
    updateCount();
  });
}

function observeActive(){
  const tools=$('#tools');
  if(!tools||tools.dataset.activeObserver)return;
  tools.dataset.activeObserver='1';
  const observer=new MutationObserver(()=>{
    tools.querySelectorAll('.tool[data-tool]').forEach(button=>button.setAttribute('aria-pressed',button.classList.contains('active')?'true':'false'));
  });
  observer.observe(tools,{attributes:true,subtree:true,attributeFilter:['class']});
}

function refresh(){
  ensureStyles();
  ensureToolbar();
  decorateTools();
  bindSearch();
  observeActive();
  updateCount();
}

function init(){
  refresh();
  const tools=$('#tools');
  if(tools)new MutationObserver(()=>refresh()).observe(tools,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
