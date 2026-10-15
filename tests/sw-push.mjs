import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const listeners=new Map(),shown=[],opened=[];
const self={registration:{scope:'https://example.invalid/driverman/',showNotification:async(title,options)=>shown.push({title,options})},
  location:{origin:'https://example.invalid'},addEventListener:(name,callback)=>listeners.set(name,callback),
  clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
vm.runInNewContext(await readFile('sw.js','utf8'),{self,URL});
async function push(mode){let work;listeners.get('push')({data:{json:()=>({id:12,title:'Départ',body:'Test',mode,page:'movements'})},waitUntil:p=>work=p});await work;return shown.at(-1).options;}
assert.equal((await push('silent')).silent,true);
assert.deepEqual(Array.from((await push('vibrate')).vibrate),[200,100,200]);
assert.equal((await push('sound')).vibrate.length,0);
assert.equal((await push('both')).tag,'driverman-12','Un identifiant stable évite les doublons visuels lors d’une reprise.');
assert.equal(shown.at(-1).options.data.id,'12','Le clic conserve l’identifiant exact de l’alerte.');
let click;listeners.get('notificationclick')({notification:{close(){},data:{page:'https://evil.invalid/'}},waitUntil:p=>click=p});await click;
assert.equal(opened[0],'https://example.invalid/driverman/#notifications','Un clic reste dans DriverMan.');
listeners.get('notificationclick')({notification:{close(){},data:{id:'12',page:'fuel'}},waitUntil:p=>click=p});await click;
assert.equal(opened.at(-1),'https://example.invalid/driverman/?notification=12#fuel','Ouverture à froid : l’application reçoit l’identifiant à marquer lu.');
const navigated=[];let focused=0;
self.clients.matchAll=async()=>[{url:'https://example.invalid/driverman/',navigate:async url=>navigated.push(url),focus:async()=>focused++}];
listeners.get('notificationclick')({notification:{close(){},tag:'driverman-13',data:{page:'movements'}},waitUntil:p=>click=p});await click;
assert.equal(navigated[0],'https://example.invalid/driverman/?notification=13#movements','Ancienne notification : lecture déduite du tag.');assert.equal(focused,1);
console.log('Web Push : affichage arrière-plan, modes et destination du clic vérifiés.');
