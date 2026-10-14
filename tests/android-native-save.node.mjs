import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('modules/android-native-save.js','utf8');
const calls=[];
class Anchor{
 constructor(){this.download='output.pdf';this.href='blob:https://localhost/123';}
 click(){calls.push('browser-download');}
}
const fsPlugin={
 async writeFile(args){calls.push('write:'+args.path);},
 async getUri(){return {uri:'content://local/test'};}
};
const sharePlugin={async share(args){calls.push('share:'+args.url);}};
const context={
 window:{Capacitor:{isNativePlatform:()=>true,Plugins:{Filesystem:fsPlugin,Share:sharePlugin}}},
 HTMLAnchorElement:Anchor,
 document:{querySelector:()=>null,addEventListener:()=>{}},
 fetch:async()=>({ok:true,blob:async()=>new Blob(['sample'])}),
 Blob,btoa,Uint8Array,console,Date
};
vm.runInNewContext(source,context);
const anchor=new Anchor();
anchor.click();
await new Promise(resolve=>setTimeout(resolve,30));
assert.ok(calls.some(x=>x.startsWith('write:')),'File is written through native Filesystem');
assert.ok(calls.some(x=>x.startsWith('share:')),'Android share sheet is opened');
assert.equal(calls.includes('browser-download'),false,'Detached anchor did not bypass native save');
console.log('Android native save interception passed');
