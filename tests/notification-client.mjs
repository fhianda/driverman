import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/notifications.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(permission='granted') {
  const calls=[],listeners=[],storage=new Map(),panel={innerHTML:''};
  let prompts=0,subscriptions=0;
  const subscription={toJSON:()=>({endpoint:'https://example.invalid/push'}),unsubscribe:async()=>true};
  const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>{subscriptions++;return subscription;}},getNotifications:async()=>[]};
  const Notification={permission,requestPermission:async()=>{prompts++;Notification.permission='granted';return 'granted';}};
  const state={authenticated:true,data:{user:{id:1,role:'admin'}},page:'notifications'};
  const payload={delivery:{web:true,publicKey:'AQID'},devices:[],items:[],unread:0,demo:false};
  const window={isSecureContext:true,Notification,PushManager:{}};
  vm.runInNewContext(source,{window,Notification,state,isAdmin:()=>state.data.user.role==='admin',
    document:{visibilityState:'visible',querySelector:s=>s==='#notification-settings'?panel:null,addEventListener:(name,fn)=>listeners.push(fn)},
    navigator:{serviceWorker:{ready:Promise.resolve(registration),getRegistration:async()=>registration}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    api:async(action,body)=>{calls.push({action,body});return structuredClone(payload);},icon:()=>'',esc:String,toast:()=>{},
    Date,atob,Uint8Array,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{}
  });
  return {app:window.DriverManNotifications,state,Notification,panel,calls,payload,registration,
    click:()=>listeners[0]({isTrusted:true,target:{closest:()=>null}}),prompts:()=>prompts,subscriptions:()=>subscriptions};
}
const granted=fixture();granted.app.onRender();await tick();
assert.equal(granted.calls.filter(c=>c.action==='subscribe-push').length,1,'Permission déjà accordée : inscription automatique.');
assert.equal(granted.prompts(),0);
await granted.app.refresh({render:true});await tick();assert.equal(granted.subscriptions(),1,'Pas de double inscription à chaque rafraîchissement.');
assert.doesNotMatch(granted.panel.innerHTML,/notification-form|notification-device|select|Enregistrer mes choix/);
assert.match(granted.panel.innerHTML,/prochains départs et achats/);
const fresh=fixture('default');fresh.app.onRender();await tick();assert.equal(fresh.prompts(),0,'Pas de demande hors geste utilisateur dans le navigateur.');
fresh.click();await tick();assert.equal(fresh.prompts(),1);assert.equal(fresh.subscriptions(),1);
const denied=fixture('denied');denied.app.onRender();await tick();denied.click();await tick();
assert.equal(denied.prompts(),0);assert.equal(denied.subscriptions(),0);assert.match(denied.panel.innerHTML,/refusée/);
const driver=fixture();driver.state.data.user.role='driver';driver.app.onRender();await tick();driver.click();assert.equal(driver.calls.length,0);
const stale=fixture('default');let resolvePermission;
stale.Notification.requestPermission=()=>new Promise(resolve=>{resolvePermission=resolve;});
stale.app.onRender();await tick();stale.click();await stale.app.beforeLogout();
resolvePermission('granted');await tick();assert.equal(stale.subscriptions(),0,'Déconnexion pendant la permission : aucune inscription tardive.');
const failure=fixture();failure.registration.pushManager.subscribe=async()=>{throw Error('offline');};
failure.app.onRender();await tick();assert.equal(failure.calls.some(c=>c.action==='subscribe-push'),false);
console.log('Web Push : activation automatique, geste utilisateur, refus, historique, déconnexion et panne vérifiés.');
