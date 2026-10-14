import {cp, mkdir, rm, readFile, writeFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'www');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of ['index.html','manifest.webmanifest','icon.svg','excel-tool.js']){
  await cp(path.join(root,file),path.join(output,file));
}
for(const folder of ['core','modules','ui']){
  await cp(path.join(root,folder),path.join(output,folder),{recursive:true});
}
const vendorFiles={
  'pdf.min.js':'pdfjs-dist/build/pdf.min.js',
  'pdf.worker.min.js':'pdfjs-dist/build/pdf.worker.min.js',
  'pdf-lib.min.js':'pdf-lib/dist/pdf-lib.min.js',
  'jszip.min.js':'jszip/dist/jszip.min.js',
  'xlsx.full.min.js':'xlsx/dist/xlsx.full.min.js',
  'tesseract.min.js':'tesseract.js/dist/tesseract.min.js',
  'worker.min.js':'tesseract.js/dist/worker.min.js'
};
await mkdir(path.join(output,'vendor'),{recursive:true});
for(const [target,source] of Object.entries(vendorFiles)){
  const original=path.join(root,'node_modules',source);
  await access(original);
  await cp(original,path.join(output,'vendor',target));
}
const htmlFile=path.join(output,'index.html');
let html=await readFile(htmlFile,'utf8');
const scriptMap={
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js':'vendor/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js':'vendor/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js':'vendor/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js':'vendor/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js':'vendor/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js':'vendor/pdf.worker.min.js'
};
for(const [remote,local] of Object.entries(scriptMap)){
  if(!html.includes(remote))throw Error('Missing expected external library: '+remote);
  html=html.split(remote).join(local);
}
html=html.replace("if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));","/* Native Android bundles libraries locally; no web Service Worker required. */");
html=html.replace('</body></html>','<script src="./modules/android-native-save.js"></script></body></html>');
await writeFile(htmlFile,html);
const required=['vendor/pdf.min.js','vendor/pdf.worker.min.js','vendor/pdf-lib.min.js','vendor/jszip.min.js','vendor/xlsx.full.min.js','vendor/tesseract.min.js'];
for(const rel of required)await access(path.join(output,rel));
if(/<script src="https?:\/\//i.test(html))throw Error('External script remains in Android bundle');
console.log('Android bundle includes local PDF/ZIP/Excel/OCR JS runtimes and native save integration.');
