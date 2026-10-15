import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DepartureGps} from '../src/departure-gps.js';
const source=(await readFile(new URL('../src/bridge.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const stored=new Map([['driverman-session',{server:'https://example.invalid/',userId:1,token:'fake-session'}]]);
const listeners=new Map(),requests=[];let permission='prompt',unregistered=0,prompts=0;
const window={addEventListener(){}};
const PushNotifications={
  addListener:async(name,callback)=>listeners.set(name,callback),checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>{prompts++;permission='granted';return {receive:permission};},
  register:async()=>{await listeners.get('registration')({value:'fake-firebase-token'});},
  unregister:async()=>{unregistered++;},removeAllDeliveredNotifications:async()=>{}
};
const context=vm.createContext({__DRIVERMAN_PUSH_CONFIGURED__:true,Capacitor:{getPlatform:()=> 'android',isNativePlatform:()=>true},
  DepartureGps,LocalNotifications:{},
  registerPlugin:()=>({}),PushNotifications,SecureStorage:{setSynchronize:async()=>{},setDefaultKeychainAccess:async()=>{},get:async key=>structuredClone(stored.get(key)),set:async(k,v)=>stored.set(k,structuredClone(v)),remove:async k=>stored.delete(k)},KeychainAccess:{},
  CapacitorHttp:{request:async r=>{requests.push(r);return {status:200,data:{success:true}};}},App:{addListener(){}},
  document:{querySelector:()=>null,addEventListener(){}},window,URL,URLSearchParams,FormData,Blob,ArrayBuffer,Uint8Array,btoa,Date,setTimeout,clearTimeout,console
});
vm.runInContext(source,context);const mobile=window.DriverManMobile;await mobile.ready;
assert.equal(mobile.notifications.configured,true);
await assert.rejects(mobile.notifications.enable(),/administrateurs/);
await mobile.onData({user:{id:1,role:'admin'},movements:[]});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requests.length,1,'Inscription automatique après connexion administrateur.');
assert.equal(prompts,1,'Une seule demande système, sans écran de réglages.');
await mobile.onData({user:{id:1,role:'admin'},movements:[]});
assert.equal(requests.length,1,'Un rafraîchissement ne réinscrit pas le même appareil.');
assert.equal(new URL(requests[0].url).searchParams.get('action'),'subscribe-push');
assert.equal(requests[0].headers.Authorization,'Bearer fake-session');
assert.equal(requests[0].data.kind,'android');assert.equal(requests[0].data.token,'fake-firebase-token');
assert.equal(stored.get('driverman-push:https://example.invalid/|1'),true);
permission='denied';await assert.rejects(mobile.notifications.enable(),/autorisation Android/);
assert.equal(await mobile.notifications.permission(),'denied');
await mobile.notifications.disable();assert.equal(unregistered,1);assert.equal(stored.has('driverman-push:https://example.invalid/|1'),false);
console.log('Android Push : permission, inscription authentifiée, activation automatique et déconnexion vérifiés.');
