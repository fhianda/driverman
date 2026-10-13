import {copyFile, mkdir} from 'node:fs/promises';
await mkdir(new URL('../assets/licenses/', import.meta.url), {recursive:true});
await copyFile(new URL('../node_modules/@alpinejs/csp/dist/cdn.min.js', import.meta.url), new URL('../assets/alpine-csp.min.js', import.meta.url));
await copyFile(new URL('../node_modules/daisyui/LICENSE', import.meta.url), new URL('../assets/licenses/daisyui-MIT.txt', import.meta.url));
console.log('Alpine.js CSP et licences copiés dans assets/.');
await mkdir(new URL('../assets/vendor/',import.meta.url),{recursive:true});
for(const [pkg,file,target,license] of [
  ['jspdf','dist/jspdf.umd.min.js','jspdf.umd.min.js','LICENSE'],
  ['jspdf-autotable','dist/jspdf.plugin.autotable.min.js','jspdf.plugin.autotable.min.js','LICENSE.txt'],
  ['exceljs','dist/exceljs.min.js','exceljs.min.js','LICENSE'],
]) {
  await copyFile(new URL(`../node_modules/${pkg}/${file}`,import.meta.url),new URL(`../assets/vendor/${target}`,import.meta.url));
  await copyFile(new URL(`../node_modules/${pkg}/${license}`,import.meta.url),new URL(`../assets/licenses/${pkg}-MIT.txt`,import.meta.url));
}
console.log('Modules PDF et Excel copiés localement.');
for (const file of ['leaflet.js','leaflet.css']) await copyFile(new URL(`../node_modules/leaflet/dist/${file}`,import.meta.url),new URL(`../assets/vendor/${file}`,import.meta.url));
await copyFile(new URL('../node_modules/leaflet/LICENSE',import.meta.url),new URL('../assets/licenses/leaflet-BSD.txt',import.meta.url));
