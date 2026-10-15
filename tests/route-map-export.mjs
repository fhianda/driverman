import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const context=vm.createContext({setTimeout,Blob});
vm.runInContext(await readFile(new URL('../assets/route-map-export.js',import.meta.url),'utf8'),context);
const exporter=vm.runInContext('DriverManMapExport',context);
const box={left:0,top:0,right:300,bottom:400,width:300,height:400};
const map={getContainer:()=>({isConnected:true,getBoundingClientRect:()=>box})};
const tile={complete:true,naturalWidth:256,dataset:{mapError:'true'},getBoundingClientRect:()=>box};
const layer={getContainer:()=>({querySelectorAll:()=>[tile]}),isLoading:()=>false};
await assert.rejects(exporter.file('pdf',map,layer,[],{},'GPS',()=>true),/fond de carte n’est pas chargé/,'Ne pas exporter une image d’erreur 403.');
tile.dataset={};tile.naturalWidth=0;
await assert.rejects(exporter.file('jpeg',map,layer,[],{},'GPS',()=>true),/fond de carte n’est pas chargé/,'Ne pas exporter des tuiles manquantes.');
await assert.rejects(exporter.file('jpeg',map,layer,[],{},'GPS',()=>false),/tracé a changé/,'Abandonner si la carte est fermée ou remplacée.');
console.log('Exports carte : fond bloqué/incomplet refusé et changement de tracé détecté.');
