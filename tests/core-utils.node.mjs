import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../core/pdf-studio-utils.js',import.meta.url),'utf8');
const sandbox={
  window:{},
  document:{querySelector(){return null}},
  Blob,
  URL:{createObjectURL(){return'blob:test'},revokeObjectURL(){}},
  setTimeout
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'pdf-studio-utils.js'});
const U=sandbox.window.PDFStudioUtils;

assert.equal(U.normalizeDigits('١٬٢٣٤٫٥٦'),'1,234.56');
assert.deepEqual([...U.parsePages('1-3, 5',6)],[0,1,2,4]);
assert.deepEqual([...U.parsePages('٣-١',4,{unique:false})],[2,1,0]);
assert.equal(U.safeName('كشف:حساب?.pdf'),'كشف_حساب_');
assert.equal(U.arabicDominant('مرحبا بالعالم world'),true);
assert.equal(U.median([9,1,5]),5);

const rows=U.groupRows([
  {str:'البيان',transform:[10,0,0,10,90,100],width:35,height:10},
  {str:'المبلغ',transform:[10,0,0,10,20,100],width:35,height:10},
  {str:'100',transform:[10,0,0,10,20,80],width:18,height:10},
  {str:'رسوم',transform:[10,0,0,10,90,80],width:25,height:10}
]);
assert.equal(rows.length,2);
assert.equal(rows[0].rtl,true);
assert.equal(rows[0].text.includes('البيان'),true);

console.log('PDF Studio core utility tests passed');