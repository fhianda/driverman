import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/notifications.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(permission='granted') {
  const calls=[],listeners=[],storage=new Map(),panel={innerHTML:''},badge={textContent:'',hidden:true},errors=[];
  let failRead=false,deferGet=false,releaseGet;
  const location={href:'https://example.invalid/driverman/',get hash(){return new URL(this.href).hash;},set hash(value){const url=new URL(this.href);url.hash=value;this.href=url.href;}};
  const history={replaceState:(_a,_b,path)=>{location.href=new URL(path,location.href).href;}};
  let prompts=0,subscriptions=0;
  const subscription={toJSON:()=>({endpoint:'https://example.invalid/push'}),unsubscribe:async()=>true};
  const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>{subscriptions++;return subscription;}},getNotifications:async()=>[]};
  const Notification={permission,requestPermission:async()=>{prompts++;Notification.permission='granted';return 'granted';}};
  const state={authenticated:true,data:{user:{id:1,role:'admin'}},page:'notifications'};
  const payload={delivery:{web:true,publicKey:'AQID'},devices:[],items:[],unread:0,demo:false};
  const window={isSecureContext:true,Notification,PushManager:{}};
  const document={visibilityState:'visible',querySelector:s=>s==='#notification-settings'&&state.page==='notifications'?panel:s==='[data-notification-count]'?badge:null,addEventListener:(name,fn)=>listeners.push(fn)};
  vm.runInNewContext(source,{window,Notification,state,location,history,URL,isAdmin:()=>state.data.user.role==='admin',document,
    navigator:{serviceWorker:{ready:Promise.resolve(registration),getRegistration:async()=>registration}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    api:async(action,body)=>{
      calls.push({action,body});
      if(action==='read-notifications') {
        if(failRead)throw Error('offline');
        for(const item of payload.items)if(body.ids?.includes(item.id)||item.id<=body.through)item.read_at ||= 12345;
        payload.unread=payload.items.filter(item=>!item.read_at).length;
      }
      const snapshot=structuredClone(payload);
      if(action==='notifications'&&deferGet){deferGet=false;return new Promise(resolve=>{releaseGet=()=>resolve(snapshot);});}
      return snapshot;
    },icon:()=>'',esc:String,toast:message=>errors.push(message),
    Date,atob,Uint8Array,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{}
  });
  return {app:window.DriverManNotifications,state,Notification,panel,calls,payload,registration,badge,location,document,errors,
    failRead:()=>{failRead=true;},deferGet:()=>{deferGet=true;},releaseGet:()=>releaseGet(),
    clickItem:id=>listeners[1]({target:{closest:selector=>selector==='[data-notification-id]'?{dataset:{notificationId:String(id)}}:null}}),
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

const alert=id=>({id,event:'departure',title:'Départ',body:'Test',created_at:12345,read_at:null});
const inbox=fixture();inbox.payload.items=[alert(2),alert(1)];inbox.payload.unread=2;
inbox.app.onRender();await tick();await tick();
assert.equal(inbox.payload.unread,0,'Ouvrir l’historique marque les alertes affichées comme lues.');
assert.equal(inbox.badge.hidden,true);assert.doesNotMatch(inbox.panel.innerHTML,/is-unread|notification-unread-dot|non lues/);
assert.deepEqual(Array.from(inbox.calls.find(c=>c.action==='read-notifications').body.ids),[2,1]);
await inbox.app.refresh({render:true});await tick();assert.equal(inbox.badge.hidden,true,'Actualiser ne fait pas réapparaître le compteur.');

const item=fixture();item.state.page='overview';item.payload.items=[alert(8),alert(7)];item.payload.unread=2;
item.app.onRender();await tick();assert.equal(item.badge.textContent,'2');
await item.clickItem(8);assert.equal(item.payload.unread,1);assert.equal(item.badge.textContent,'1');
await item.clickItem(8);assert.equal(item.payload.unread,1,'Lecture idempotente côté écran.');

const push=fixture();push.state.page='movements';push.location.href='https://example.invalid/driverman/?notification=9#movements';push.payload.items=[alert(10),alert(9)];push.payload.unread=2;
push.app.onRender();await tick();await tick();
assert.equal(push.badge.textContent,'1');assert.equal(push.payload.items[0].read_at,null,'Un clic push ne lit pas les autres alertes.');
assert.equal(new URL(push.location.href).searchParams.has('notification'),false,'Le lien est nettoyé après confirmation serveur.');

const native=fixture();native.state.page='movements';native.payload.items=[alert(11)];native.payload.unread=1;
native.app.open('11','fuel'); // Notification arrives before the admin shell has rendered.
native.app.onRender();await tick();await tick();assert.equal(native.badge.hidden,true);assert.equal(native.location.hash,'#fuel');

const racing=fixture();racing.state.page='overview';racing.payload.items=[alert(12)];racing.payload.unread=1;
racing.app.onRender();await tick();racing.deferGet();const staleRefresh=racing.app.refresh();
await racing.clickItem(12);assert.equal(racing.badge.hidden,true);
racing.releaseGet();await staleRefresh;assert.equal(racing.badge.hidden,true,'Une réponse GET antérieure ne rétablit pas le compteur après lecture.');

const unread=fixture();unread.payload.items=[alert(13)];unread.payload.unread=1;unread.failRead();
unread.app.onRender();await tick();await tick();assert.equal(unread.badge.textContent,'1');assert.equal(unread.badge.hidden,false);
assert.equal(unread.payload.items[0].read_at,null);assert.match(unread.errors[0],/Lecture non enregistrée/);
const hidden=fixture();hidden.payload.items=[alert(14)];hidden.payload.unread=1;hidden.document.visibilityState='hidden';
hidden.app.onRender();await tick();assert.equal(hidden.payload.unread,1,'Un onglet masqué ne marque rien lu.');
console.log('Lecture : cloche, alerte individuelle, clic push, démarrage à froid, compteur, courses réseau et refus vérifiés.');
