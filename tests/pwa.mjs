import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../assets/pwa.js',import.meta.url),'utf8');
function environment({stored={},standalone=false,related,privateStorage=false,ios=false,ipad=false,iosStandalone=false,base='http://localhost/driverman/'}={}) {
  const events={},domEvents={},timers=[],storage=new Map(Object.entries(stored));let dialog;
  const fields=new Map();
  function element(){return {open:false,innerHTML:'',textContent:'',hidden:false,disabled:false,setAttribute(){},addEventListener(){},querySelector(selector){if(!fields.has(selector))fields.set(selector,element());return fields.get(selector);},showModal(){this.open=true;},close(){this.open=false;}};}
  const document={currentScript:{src:base+'assets/pwa.js'},body:{append(el){dialog=el;}},querySelector(){return dialog?.open?dialog:null;},querySelectorAll(){return [];},createElement:element,addEventListener(name,fn){domEvents[name]=fn;}};
  const window={isSecureContext:true,matchMedia:()=>({matches:standalone,addEventListener(){}}),addEventListener(name,fn){events[name]=fn;}};
  const navigator={userAgent:ios?'iPhone Safari':'Chrome',platform:ipad?'MacIntel':'Win32',maxTouchPoints:ipad?5:0,standalone:iosStandalone};
  if(related)navigator.getInstalledRelatedApps=async()=>related;
  const localStorage={getItem:k=>{if(privateStorage)throw Error('storage disabled');return storage.get(k);},setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const context=vm.createContext({window,document,navigator,localStorage,URL,setTimeout:fn=>timers.push(fn)});vm.runInContext(code,context);
  return {events,domEvents,storage,timers,fields,dialog:()=>dialog,html:()=>vm.runInContext('DriverManPwa.buttonHtml()',context)};
}
const fresh=environment();await fresh.domEvents.DOMContentLoaded();fresh.timers.shift()();assert.equal(fresh.dialog().open,true);assert.ok(fresh.html().includes('Installer l’application'));
assert.equal(fresh.storage.get('driverman-pwa:/driverman/:seen'),'1');
const returning=environment({stored:Object.fromEntries(fresh.storage)});await returning.domEvents.DOMContentLoaded();assert.equal(returning.timers.length,0);
const installed=environment({standalone:true});await installed.domEvents.DOMContentLoaded();assert.ok(installed.html().includes('Installé'));assert.equal(installed.timers.length,0);
const detected=environment({related:[{platform:'webapp',url:'http://localhost/driverman/manifest.webmanifest'}]});await detected.domEvents.DOMContentLoaded();assert.ok(detected.html().includes('Installé'));
const removed=environment({stored:{'driverman-pwa:/driverman/:installed':'1','driverman-pwa:/driverman/:seen':'1'},related:[]});await removed.domEvents.DOMContentLoaded();assert.ok(removed.html().includes('Installer l’application'));
let prevented=false;installed.events.beforeinstallprompt({preventDefault(){prevented=true;}});assert.ok(prevented);assert.ok(installed.html().includes('Installer l’application'));
fresh.events.appinstalled();assert.ok(fresh.html().includes('Installé'));assert.equal(fresh.dialog().open,false);
const decline=environment();await decline.domEvents.DOMContentLoaded();decline.timers.shift()();let promptCount=0;
decline.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{promptCount++;},userChoice:Promise.resolve({outcome:'dismissed'})});
decline.domEvents.click({target:{closest:selector=>selector==='[data-pwa-confirm]'}});await new Promise(resolve=>setImmediate(resolve));
assert.equal(promptCount,1);assert.equal(decline.dialog().open,false);assert.ok(decline.html().includes('Installer l’application'));
const accept=environment();await accept.domEvents.DOMContentLoaded();accept.timers.shift()();
accept.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});
accept.domEvents.click({target:{closest:selector=>selector==='[data-pwa-confirm]'}});await new Promise(resolve=>setImmediate(resolve));
assert.ok(accept.html().includes('Installer l’application'));accept.events.appinstalled();assert.ok(accept.html().includes('Installé'));
const privateEnv=environment({privateStorage:true});await privateEnv.domEvents.DOMContentLoaded();privateEnv.timers.shift()();assert.ok(privateEnv.dialog().open);
for(const device of [{ios:true},{ipad:true}]) {
  const apple=environment({...device,base:'https://driverman.trackkintrans.com/'});
  await apple.domEvents.DOMContentLoaded();apple.timers.shift()();
  assert.ok(apple.fields.get('#pwa-instructions').textContent.includes('Ouvrir comme app web'));
  assert.ok(apple.dialog().innerHTML.includes('écran verrouillé'));
  assert.ok(!apple.dialog().innerHTML.includes('data-pwa-confirm'),'iOS présente les étapes Safari sans faux bouton d’installation automatique.');
  assert.equal(apple.storage.get('driverman-pwa:/:seen'),'1','La PWA fonctionne à la racine du domaine public.');
}
const appleInstalled=environment({ios:true,iosStandalone:true});await appleInstalled.domEvents.DOMContentLoaded();assert.ok(appleInstalled.html().includes('Installé'));
const appleRemoved=environment({ios:true,stored:{'driverman-pwa:/driverman/:installed':'1','driverman-pwa:/driverman/:seen':'1'}});await appleRemoved.domEvents.DOMContentLoaded();assert.ok(appleRemoved.html().includes('Installer l’application'),'Safari permet de retrouver les instructions après suppression de l’icône.');
// Le service worker ne doit intercepter ni les API ni les écritures, même hors connexion.
const swEvents={},cached=[];const scope='http://localhost/driverman/';
const cache={addAll:async files=>cached.push(...files),match:async()=>({offline:true})};
const context=vm.createContext({self:{registration:{scope},location:{origin:'http://localhost'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>swEvents[name]=fn},caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},URL,fetch:async()=>{throw Error('offline');}});
vm.runInContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
let task;swEvents.install({waitUntil:p=>task=p});await task;assert.equal(cached.length,4);assert.ok(cached.every(url=>!url.endsWith('index.php')&&!url.includes('api.php')));
for(const request of [{url:scope+'api.php?action=bootstrap',method:'GET',mode:'cors'},{url:scope+'api.php?action=save-driver',method:'POST',mode:'cors'},{url:'http://localhost/another/',method:'GET',mode:'navigate'}]) {
  let intercepted=false;swEvents.fetch({request,respondWith(){intercepted=true;}});assert.equal(intercepted,false);
}
swEvents.fetch({request:{url:scope,method:'GET',mode:'navigate'},respondWith:p=>task=p});assert.deepEqual(await task,{offline:true});
const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons){const png=await readFile(new URL('../'+icon.src,import.meta.url));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}
console.log('PWA : première visite, visites suivantes, installation détectée, désinstallation, stockage privé, icônes et absence de cache des données privées vérifiés.');
