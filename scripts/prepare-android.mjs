import {cp, mkdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'www');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of ['index.html','manifest.webmanifest','icon.svg','sw.js','excel-tool.js']){
  await cp(path.join(root,file),path.join(output,file));
}
for(const folder of ['core','modules','ui']){
  await cp(path.join(root,folder),path.join(output,folder),{recursive:true});
}
console.log('Prepared bundled PDF Studio web assets for Android');
