import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const sw=read('sw.js');
const coreMatch=sw.match(/const CORE=\[(.*?)\];/s);
assert.ok(coreMatch,'تعذر قراءة قائمة ملفات PWA الأساسية');
const coreFiles=[...coreMatch[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);

for(const entry of coreFiles){
  if(entry==='./')continue;
  const local=entry.replace(/^\.\//,'');
  assert.ok(fs.existsSync(path.join(root,local)),`ملف PWA غير موجود: ${local}`);
}

assert.equal(sw.includes('book-fix.js'),false,'يجب ألا يعود ملف الكتب القديم المكسور إلى PWA');
assert.ok(sw.includes('modules/pdf-word-docx.js'),'وحدة Word غير مرتبطة في PWA');
assert.ok(sw.includes('modules/pdf-tables-advanced.js'),'وحدة الجداول غير مرتبطة في PWA');
assert.ok(sw.includes('modules/pdf-existing-tools-enhanced.js'),'تحسينات الأدوات الحالية غير مرتبطة في PWA');

const sandbox={self:{addEventListener(){}}};
vm.createContext(sandbox);
vm.runInContext(sw,sandbox,{filename:'sw.js'});
const htmlWithEmbeddedBody=`<!doctype html><html><body><script>const exported='<html><body>text</body></html>';</script><main>واجهة سليمة</main></body></html>`;
const patched=vm.runInContext(`patchHtml(${JSON.stringify(htmlWithEmbeddedBody)})`,sandbox);
const embeddedBody=patched.indexOf("text</body></html>'");
const firstModule=patched.indexOf('<script src="./core/pdf-studio-utils.js"></script>');
const finalBody=patched.lastIndexOf('</body>');
assert.ok(embeddedBody>=0,'تم تغيير قالب HTML الموجود داخل JavaScript');
assert.ok(firstModule>embeddedBody,'تم حقن وحدات PWA داخل JavaScript بدل نهاية الصفحة');
assert.ok(firstModule<finalBody,'يجب حقن وحدات PWA قبل وسم body الأخير');
const patchedTwice=vm.runInContext(`patchHtml(${JSON.stringify(patched)})`,sandbox);
assert.equal(patchedTwice,patched,'حقن وحدات PWA يجب أن يكون آمنًا عند التكرار');

const word=read('modules/pdf-word-docx.js');
assert.ok(word.includes('[data-tool="word"]'),'زر Word غير مربوط بوحدة DOCX');
assert.ok(word.includes('stopImmediatePropagation'),'وحدة Word لا تمنع المحول القديم من العمل بالتوازي');
assert.equal(/\bwindow\.word\b/.test(word),false,'وحدة Word ما زالت تعتمد الربط القديم');
assert.equal(/\bif\(!doc\)/.test(word),false,'وحدة Word ما زالت تعتمد متغير doc القديم');

const enhanced=read('modules/pdf-existing-tools-enhanced.js');
for(const tool of ['images','book','batch','blank','compare']){
  assert.ok(enhanced.includes(`'${tool}'`),`تحسين الأداة غير موجود: ${tool}`);
}

console.log('PDF Studio integration tests passed');