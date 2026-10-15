import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {PositionQueue} from '../src/queue.js';
import {DepartureGps} from '../src/departure-gps.js';
const stored=new Map([
  ['driverman-session',{server:'https://driver.example.invalid/',token:'test',userId:7}],
  ['driverman-gps:https://driver.example.invalid/|7',true],
]);
let watches=new Map(),serial=0,offline=true,saved=[],returned=0,shared=[],requests=[];
const secure={get:async key=>structuredClone(stored.get(key)),set:async(key,value)=>stored.set(key,structuredClone(value)),remove:async key=>stored.delete(key),setSynchronize:async()=>{},setDefaultKeychainAccess:async()=>{}};
const gps={addWatcher:async(opts,callback)=>{assert.ok(opts.backgroundMessage);assert.equal(opts.distanceFilter,0,'La collecte ne dépend pas du déplacement du véhicule.');const id=String(++serial);watches.set(id,callback);return id;},removeWatcher:async({id})=>{watches.delete(id);}};
const window={addEventListener(){}};
const context=vm.createContext({
  Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},registerPlugin:name=>name==='TripGps'?{status:async()=>({precise:true,background:true,locationEnabled:true})}:gps,SecureStorage:secure,KeychainAccess:{},PositionQueue,DepartureGps,
  CapacitorHttp:{request:async request=>{
    requests.push(request);
    const action=new URL(request.url).searchParams.get('action');
    if(offline)throw Error('offline');
    if(action==='save-positions'){saved.push(...request.data.points);return{status:200,data:{accepted:request.data.points.map(p=>p.sample_id)}};}
    if(action==='return'){returned++;return{status:200,data:{success:true}};}
    if(action==='save-vehicle')return{status:200,data:{success:true}};
    if(action==='depart')return{status:200,data:{success:true,movement_id:45}};
    throw Error(`Unexpected action: ${action}`);
  }},
  App:{addListener(){}},LocalNotifications:{checkPermissions:async()=>({display:'granted'})},Filesystem:{writeFile:async file=>{shared.push(file);return{uri:'file:///cache/'+file.path};}},Directory:{Cache:'CACHE'},Encoding:{UTF8:'utf8'},Share:{share:async file=>shared.push(file)},
  document:{querySelector:()=>null,addEventListener(){}},window,crypto,URL,URLSearchParams,FormData,Blob,ArrayBuffer,Uint8Array,btoa,Date,console,
});
const source=(await readFile(new URL('../src/bridge.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
vm.runInContext(source,context);const mobile=window.DriverManMobile;await mobile.ready;
assert.equal(stored.get('driverman-session').server,'https://driver.example.invalid/','Une mise à jour conserve le serveur déjà configuré.');
const data={user:{id:7,role:'driver',driver_id:4},vehicles:[],drivers:[],refuelings:[],movements:[{id:12,driver_id:4,end_at:null}]};
await mobile.onData(data);assert.equal(watches.size,1,'Le suivi démarre pour la course autorisée.');
await watches.values().next().value({latitude:-4.325,longitude:15.322,accuracy:8,time:Date.now()});
const key='driverman-positions:https://driver.example.invalid/|7';
assert.equal(stored.get(key).points.length,1,'La position est conservée hors réseau.');
await watches.values().next().value({latitude:-4.32,longitude:15.32,accuracy:8,time:Date.now()+1});
assert.equal(stored.get(key).points.length,1,'Un autre callback immédiat n’ajoute pas de relevé avant 15 secondes.');
await assert.rejects(mobile.call('return',{id:12,end_at:'2026-10-08T21:00'}),/offline/);
assert.equal(stored.get(key).points.length,2,'Le point de retour est conservé même avant 15 secondes, y compris hors réseau.');
assert.equal(returned,0,'Aucun retour confirmé pendant la panne.');assert.equal(watches.size,1,'Le suivi reprend après un retour refusé.');
offline=false;await mobile.call('return',{id:12,end_at:'2026-10-08T21:00'});
assert.equal(returned,1);assert.equal(saved.length,2);assert.equal(stored.get(key).points.length,0);assert.equal(watches.size,0,'Le suivi s’arrête au retour.');
assert.equal(saved[1].latitude,-4.32,'Le dernier point reçu ferme le tracé.');
await mobile.onData({...data,movements:[{id:12,end_at:'2026-10-08T21:00'}]});assert.equal(watches.size,0,'Aucun suivi hors course.');
await mobile.saveFile('itineraire-12.gpx','<gpx/>');assert.equal(shared[0].data,'<gpx/>');assert.equal(shared[1].files[0],'file:///cache/itineraire-12.gpx');
assert.equal(typeof mobile.loginRendered,'function');
const longHistory={...data,movements:[...Array.from({length:201},(_,id)=>({id:100+id,end_at:'2026-10-08T20:00'})),{id:12,driver_id:4,end_at:null}]};
await mobile.onData(longHistory);
offline=true;
const cached=await mobile.call('bootstrap');
assert.equal(cached.native_offline,true);
assert.equal(cached.movements.some(m=>m.id===12&&!m.end_at),true,'La course active reste disponible hors réseau même après un long historique.');
await mobile.onData({...data,native_offline:true,movements:[]});
await mobile.onData({...data,movements:[{id:99,driver_id:9,end_at:null}]});
assert.equal(watches.size,0,'Aucune collecte pour la course d’un autre chauffeur.');
await mobile.onData({...data,movements:[{id:12,driver_id:4,end_at:null}]});assert.equal(watches.size,1);
const oldCallback=watches.values().next().value;
await mobile.onData({...data,user:{id:7,role:'admin',driver_id:null}});
assert.equal(watches.size,0,'Le passage admin arrête le suivi malgré les courses actives.');
await oldCallback({latitude:-4.3,longitude:15.3,accuracy:8,time:Date.now()+1});
assert.equal(watches.size,0,'Un callback tardif ne réactive pas le GPS admin.');
offline=false;
const form=new FormData();form.set('make','Véhicule admin');form.set('photo',new Blob([new Uint8Array([0,255,10])],{type:'image/png'}),'photo.png');
await mobile.call('save-vehicle',form);
const request=requests.at(-1);
assert.equal(request.headers.Authorization,'Bearer test');assert.equal(request.dataType,'formData');
assert.equal(request.headers['Content-Type'],'multipart/form-data');
assert.equal(request.data[0].value,'Véhicule admin');assert.equal(request.data[1].type,'base64File');
assert.equal(request.data[1].value,'AP8K');assert.equal(request.data[1].contentType,'image/png');
const emptyPhoto=new FormData();emptyPhoto.set('id','1');await mobile.call('save-vehicle',emptyPhoto);
assert.equal(requests.at(-1).data.length,1,'Modifier sans photo conserve un formulaire valide.');
form.set('photo',new Blob(['<svg/>'],{type:'image/svg+xml'}),'bad.svg');
await assert.rejects(mobile.call('save-vehicle',form),/JPG, PNG ou WebP/);
form.set('photo',new Blob([new Uint8Array(2*1024*1024+1)],{type:'image/png'}),'huge.png');
await assert.rejects(mobile.call('save-vehicle',form),/2 Mo/);
await mobile.saveFile('rapport.pdf',new Blob([new Uint8Array([37,80,68,70,0,255])],{type:'application/pdf'}));
assert.equal(shared.at(-2).data,'JVBERgD/');assert.equal(shared.at(-2).encoding,undefined,'Un PDF est transmis en binaire, sans encodage texte.');
assert.equal(shared.at(-1).files[0],'file:///cache/rapport.pdf');
await mobile.call('return',{id:12,end_at:'2026-10-08T21:00'});assert.equal(watches.size,0,'Un retour géré par admin ne lance pas le GPS.');
await mobile.onData({...data,movements:[]});
const requestsBefore=requests.length;
await assert.rejects(mobile.call('depart',{vehicle_id:1}),/GPS doit être prêt/);
assert.equal(requests.length,requestsBefore,'Aucun départ réseau sans étape GPS validée.');
await vm.runInContext('departureGps.begin()',context);
assert.equal(watches.size,1);
const preparedWatch=watches.keys().next().value;
await watches.get(preparedWatch)({latitude:-4.325,longitude:15.322,accuracy:8,time:Date.now()});
await mobile.call('depart',{vehicle_id:1,start_at:'2026-10-15T10:00',start_km:100});
assert.equal(watches.has(preparedWatch),true,'Le même service GPS continue sans coupure au départ.');
const departure=requests.findLast(r=>new URL(r.url).searchParams.get('action')==='depart');
assert.equal(departure.data.initial_position.latitude,-4.325,'Le premier point est envoyé avec la création.');
assert.equal(vm.runInContext('activeId',context),45,'Le suivi est lié à la course renvoyée par le serveur.');
await mobile.call('return',{id:45,end_at:'2026-10-15T11:00'});
assert.equal(watches.size,0,'Le retour termine aussi le service transmis par l’étape GPS.');
stored.clear();
const freshWindow={addEventListener(){}};
const freshContext=vm.createContext({...context,window:freshWindow});
vm.runInContext(source,freshContext);await freshWindow.DriverManMobile.ready;
assert.equal(stored.get('driverman-session').server,'https://driverman.trackkintrans.com/','Une nouvelle installation utilise le domaine public sans saisie.');
assert.equal(stored.get('driverman-session').token,undefined,'Aucun compte ni jeton préconfiguré.');
console.log('Mobile : GPS chauffeur, arrêt admin, formulaires avec photos, rapports binaires, file hors réseau et retour vérifiés.');
