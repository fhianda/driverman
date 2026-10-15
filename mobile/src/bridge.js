import {Capacitor,CapacitorHttp,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {LocalNotifications} from '@capacitor/local-notifications';
import {PushNotifications} from '@capacitor/push-notifications';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {SecureStorage,KeychainAccess} from '@aparajita/capacitor-secure-storage';
import {PositionQueue} from './queue.js';
import {DepartureGps} from './departure-gps.js';

const GPS=registerPlugin('BackgroundGeolocation');
const TripGps=registerPlugin('TripGps');
const DEFAULT_SERVER='https://driverman.trackkintrans.com/';
const pushConfigured=typeof __DRIVERMAN_PUSH_CONFIGURED__!=='undefined' && __DRIVERMAN_PUSH_CONFIGURED__ && Capacitor.getPlatform()==='android';
let pushListeners=null,pushRegistration=null,pushResolve=null,pushReject=null;
const pushKey=()=>`driverman-push:${settings.server}|${settings.userId}`;

async function preparePush() {
  if(!pushConfigured)return;
  if(pushListeners)return pushListeners;
  pushListeners=(async()=>{
    await PushNotifications.addListener('registration',async token=>{
      if(currentData?.user.role!=='admin'||!settings.token)return;
      const owner=`${settings.server}|${settings.userId}`,key=pushKey();
      try {
        await raw('subscribe-push',{kind:'android',token:token.value});
        if(owner!==`${settings.server}|${settings.userId}`)return;
        await SecureStorage.set(key,true,false);pushResolve?.();
      }catch(error){pushReject?.(error);}
    });
    await PushNotifications.addListener('registrationError',()=>pushReject?.(new Error('L’inscription aux notifications Android a échoué. Réessayez avec une connexion Internet.')));
    await PushNotifications.addListener('pushNotificationReceived',()=>window.DriverManNotifications?.refresh({render:state.page==='notifications'}));
    await PushNotifications.addListener('pushNotificationActionPerformed',event=>{
      if(currentData?.user.role!=='admin')return;
      const page=event.notification.data?.page;
      location.hash=['fuel','movements'].includes(page)?page:'notifications';
      loadData().catch(()=>{});
    });
  })();
  return pushListeners;
}

async function enablePush({prompt=true}={}) {
  if(!pushConfigured)throw new Error('Le service Android de notifications doit encore être configuré.');
  if(currentData?.user.role!=='admin')throw new Error('Les alertes sont réservées aux administrateurs.');
  if(pushRegistration)return pushRegistration;
  await preparePush();
  let permission=await PushNotifications.checkPermissions();
  if(permission.receive!=='granted'&&prompt)permission=await PushNotifications.requestPermissions();
  if(permission.receive!=='granted')throw new Error('Autorisez les notifications DriverMan dans les réglages Android.');
  pushRegistration=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Le service de notification ne répond pas. Réessayez.')),20000);
    pushResolve=()=>{clearTimeout(timeout);resolve();};pushReject=error=>{clearTimeout(timeout);reject(error);};
    PushNotifications.register().catch(pushReject);
  }).finally(()=>{pushRegistration=null;pushResolve=null;pushReject=null;});
  return pushRegistration;
}

async function disablePush() {
  if(!pushConfigured)return;
  pushReject?.(new Error('Activation annulée.'));
  await SecureStorage.remove(pushKey(),false);
  await PushNotifications.unregister();
  await PushNotifications.removeAllDeliveredNotifications();
}
let settings={},currentData=null,queue=null,queueOwner='',watcher=null,starting=null,activeId=null,segmentId=null;
let trackingError='',syncNotice='',lastLocation=null,enabled=false;
let departureForm=null,departureSending=false;
const departureGps=new DepartureGps({gps:GPS,permissions:TripGps,notifications:LocalNotifications,
  isUsable:location=>Boolean(queue?.isUsable(location)),onChange:updateDeparture});
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saveSettings=()=>SecureStorage.set('driverman-session',settings,false);
const snapshotKey=()=>`driverman-snapshot:${settings.server}|${settings.userId}`;
const currentDriverTrip=()=>currentData?.user.role==='driver' ? currentData.movements.find(m=>!m.end_at && m.driver_id===currentData.user.driver_id) : null;
const pause=async()=>{
  const id=watcher;watcher=null;activeId=null;lastLocation=null;
  if (id) {await GPS.removeWatcher({id});departureGps.release();}
  render();
};

function updateDeparture({message,action,ready}) {
  const form=departureForm;
  if(!form?.isConnected)return;
  form.querySelector('[data-gps-message]').textContent=message;
  const retry=form.querySelector('[data-departure-gps]');
  retry.dataset.departureGps=action;
  retry.hidden=!action;
  retry.textContent=({'background':'Autoriser le suivi écran verrouillé','app-settings':'Ouvrir les autorisations','location-settings':'Activer la localisation',retry:'Vérifier le GPS'})[action]||'Vérifier le GPS';
  form.querySelector('[type="submit"]').disabled=!ready||departureSending;
}

function departureRequired() {return Capacitor.getPlatform()==='android'&&currentData?.user.role==='driver';}
function departureStep() {
  return '<section class="departure-gps" data-departure-step hidden><p class="eyebrow">ÉTAPE 2 SUR 2</p><h3>Activer le suivi GPS</h3><p>Votre parcours sera enregistré du départ au retour, même écran verrouillé, et visible dans DriverMan. La position précise et le suivi en arrière-plan sont nécessaires.</p><p class="departure-gps-status" data-gps-message role="status">Préparation du GPS…</p><button type="button" class="btn secondary" data-departure-gps="retry">Activer le GPS</button><button type="button" class="text-button" data-departure-back>Modifier la course</button></section>';
}
async function prepareDeparture(form) {
  departureForm=form;
  form.querySelector('[data-trip-details]').hidden=true;
  form.querySelector('[data-departure-step]').hidden=false;
  form.dataset.gpsStep='true';
  form.querySelector('[type="submit"]').innerHTML='Confirmer le départ';
  await departureGps.begin({request:true});
}

async function raw(action,data,{token=settings.token,responseType='json'}={}) {
  const url=new URL('api.php',settings.server);
  const [name,...parts]=action.split('&');url.searchParams.set('action',name);
  for(const [key,value] of new URLSearchParams(parts.join('&'))) url.searchParams.set(key,value);
  const multipart=data instanceof FormData;
  const body=multipart ? await nativeFormData(data) : data;
  const response=await CapacitorHttp.request({url:url.href,method:data===undefined?'GET':'POST',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(data===undefined?{}:{'Content-Type':multipart?'multipart/form-data':'application/json'})},...(data===undefined?{}:{data:body}),...(multipart?{dataType:'formData'}:{}),responseType,connectTimeout:15000,readTimeout:20000,disableRedirects:true});
  if(response.status<200||response.status>=300) {
    const error=new Error(response.data?.error || `Le serveur a répondu avec le code ${response.status}.`);error.status=response.status;throw error;
  }
  return response.data;
}

async function base64Data(value) {
  const buffer=value instanceof Blob ? await value.arrayBuffer() : value;
  const bytes=ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength) : new Uint8Array(buffer);
  let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}

async function nativeFormData(form) {
  const entries=[];
  for(const [key,value] of form) {
    if(!/^[a-zA-Z0-9_]+$/.test(key)) throw new Error('Champ de formulaire incorrect.');
    if(typeof value==='string') entries.push({key,value,type:'string'});
    else {
      if(value.size>2*1024*1024) throw new Error('Choisissez une photo de 2 Mo maximum.');
      if(!['image/jpeg','image/png','image/webp'].includes(value.type)) throw new Error('Choisissez une photo JPG, PNG ou WebP.');
      entries.push({key,value:await base64Data(value),type:'base64File',fileName:'photo.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[value.type]),contentType:value.type});
    }
  }
  return entries;
}

function configure() {
  return new Promise(resolve=>{
    document.querySelector('#app').innerHTML=`<main class="mobile-setup"><img src="assets/telesol-logo-white.png" alt="TELESOL" width="140"><h1>DriverMan mobile</h1><p>Indiquez l’adresse HTTPS de votre installation DriverMan accessible depuis les téléphones.</p><form id="mobile-server-form"><label for="mobile-server">Adresse du serveur</label><input id="mobile-server" type="url" value="${escaped(settings.server||DEFAULT_SERVER)}" required><p id="mobile-server-error" role="alert"></p><button class="btn primary" type="submit">Connecter le serveur</button></form></main>`;
    document.querySelector('#mobile-server-form').addEventListener('submit',async event=>{
      event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
      try {
        const url=new URL(document.querySelector('#mobile-server').value);
        if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw new Error('Utilisez une adresse HTTPS, sans identifiants, paramètres ou fragment.');
        if(!url.pathname.endsWith('/')) url.pathname+='/';
        const previous=settings;
        settings={server:url.href};
        try {
        const status=await raw('status',undefined,{token:null});
        if(typeof status.needsSetup!=='boolean') throw new Error('Cette adresse ne correspond pas à une installation DriverMan.');
        await saveSettings();resolve();
        } catch(error) {settings=previous;throw error;}
      } catch(error) {document.querySelector('#mobile-server-error').textContent=error.message;button.disabled=false;}
    });
  });
}

const ready=(async()=>{
  if(!Capacitor.isNativePlatform()) throw new Error('Cette version doit être installée sur Android ou iPhone.');
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly);
  settings=await SecureStorage.get('driverman-session',false)||{};
  if(!settings.server) {settings={server:DEFAULT_SERVER};await saveSettings();}
})();

async function call(action,data) {
  await ready;
  if(action==='status') return {authenticated:Boolean(settings.token),needsSetup:false,csrf:''};
  if(action==='login') {
    const result=await raw('mobile-login',data,{token:null});
    settings={server:settings.server,token:result.token,userId:result.user_id};
    await saveSettings();return {success:true};
  }
  if(action==='logout') {
    departureForm=null;await departureGps.cancel();
    enabled=false;await pause();
    if(queue) await flush();
    await raw('logout',{});
    await disablePush().catch(()=>{});
    settings={server:settings.server};await saveSettings();currentData=null;queue=null;queueOwner='';
    return {success:true};
  }
  if(action==='depart'&&departureRequired()) {
    if(departureSending)throw new Error('Le départ est déjà en cours d’enregistrement.');
    departureSending=true;
    try {
      const position=await departureGps.verify();
      enabled=true;await SecureStorage.set(`driverman-gps:${queueOwner}`,true,false);
      const initial={sample_id:crypto.randomUUID(),segment_id:crypto.randomUUID(),recorded_at:position.time,latitude:position.latitude,longitude:position.longitude,accuracy:position.accuracy};
      const result=await raw(action,{...data,initial_position:initial});
      // Attach the live watcher immediately, without waiting for a second bootstrap.
      currentData.movements.unshift({...data,id:result.movement_id,driver_id:currentData.user.driver_id,end_at:null});
      await start(true);
      lastLocation=position;
      // The server already saved the first point atomically with the departure.
      await queue.mutate(current=>({...current,lastRecordedAt:{...current.lastRecordedAt,[result.movement_id]:initial.recorded_at}})).catch(()=>{});
      departureForm=null;
      return result;
    } finally {departureSending=false;}
  }
  if(action==='return' && currentData?.user.role==='driver') {
    // Retenir le dernier relevé récent même si les 15 secondes ne sont pas écoulées.
    // Aucun point n'est inventé si le GPS n'a pas fourni de position utilisable.
    if(queue && lastLocation && activeId===Number(data.id)) await queue.add(lastLocation,activeId,segmentId,{final:true});
    // Vider les points déjà enregistrés avant le retour ; les pannes réseau gardent la course ouverte.
    await pause();
    try {
      if(queue) await queue.flush();
      const result=await raw(action,data);
      const movement=currentData?.movements.find(m=>m.id===Number(data.id));
      if(movement) movement.end_at=data.end_at;
      await SecureStorage.remove(snapshotKey(),false);
      return result;
    }
    catch(error) { if(enabled) await start();throw error; }
  }
  try {
    const result=await raw(action,data);
    if(action==='bootstrap') {
      await Promise.all([...result.vehicles,...result.drivers].map(async item=>{
        if(!item.photo_url) return;
        try {const query=new URL(item.photo_url,settings.server).search.slice(1).replace(/^action=/,'');item.photo_url=`data:image/jpeg;base64,${await raw(query,undefined,{responseType:'arraybuffer'})}`;}
        catch {item.photo_url=null;}
      }));
    }
    return result;
  } catch(error) {
    if(action==='bootstrap'&&!error.status) {
      const cached=await SecureStorage.get(snapshotKey(),false);
      if(cached && cached.user.id===settings.userId) return {...cached,native_offline:true};
    }
    if(error.status===401) {
      await pause();settings.token=null;await saveSettings();currentData=null;
      state.authenticated=false;modal.close();renderLogin();
    }
    throw error;
  }
}

async function onData(data) {
  currentData=data;
  if(data.user.role==='admin'&&pushConfigured&&await SecureStorage.get(pushKey(),false)===true) enablePush({prompt:false}).catch(()=>{});
  if(data.user.role!=='driver') {
    enabled=false;await pause();queue=null;queueOwner='';trackingError='';syncNotice='';
    await SecureStorage.remove(snapshotKey(),false);
    render();return;
  }
  if(!data.native_offline) {
    const movements=[...data.movements.filter(m=>!m.end_at),...data.movements.filter(m=>m.end_at).slice(0,200)];
    const cached={...data,vehicles:data.vehicles.map(v=>({...v,photo_url:null})),drivers:data.drivers.map(d=>({...d,photo_url:null})),movements,refuelings:data.refuelings.slice(0,200)};
    await SecureStorage.set(snapshotKey(),cached,false);
  }
  const owner=`${settings.server}|${data.user.id}`;
  if(queueOwner!==owner) {
    await pause();queueOwner=owner;trackingError='';syncNotice='';
    const key=`driverman-positions:${owner}`;
    queue=new PositionQueue({read:()=>SecureStorage.get(key,false),write:points=>SecureStorage.set(key,points,false),send:(id,points)=>raw('save-positions',{movement_id:id,points})});
    await queue.load();
    enabled=await SecureStorage.get(`driverman-gps:${owner}`,false)===true;
  }
  const current=currentDriverTrip();
  if(activeId && activeId!==current?.id) await pause();
  if(enabled && current) await start();
  if(!current) {trackingError='';await pause();}
  flush();render();
}

async function flush() {
  if(!queue||!settings.token||currentData?.user.role!=='driver') return;
  try {
    await queue.flush(async id=>{if(activeId===id) await pause();});
    syncNotice='';
  } catch(error) {
    syncNotice=error.status===401?'Connexion expirée : reconnectez-vous pour synchroniser les points conservés.':'Synchronisation en attente. Les points restent sur ce téléphone.';
    if(error.status===401) {enabled=false;await pause();}
  }
  render();
}

function start(prepared=false) {
  if(starting) return starting;
  starting=(async()=>{
    const movement=currentDriverTrip();
    if(!enabled||!movement||watcher||!queue) return;
    activeId=movement.id;segmentId=crypto.randomUUID();
    const trip=activeId;let segment=segmentId;
    trackingError='';
    try {
      // Le service natif continue écran verrouillé. Aucun minuteur de page web.
      // Sans filtre de distance, un véhicule immobile reste relevé toutes les 15 secondes.
      const receive=async(location,error)=>{
        if(!enabled||activeId!==trip) return;
        if(error) {trackingError='La position est indisponible. Vérifiez les autorisations GPS.';render();return;}
        try {
          trackingError='';
          if(queue.isUsable(location) && (!lastLocation || location.time>lastLocation.time)) {
            if(lastLocation && location.time-lastLocation.time>60000) {segment=crypto.randomUUID();segmentId=segment;}
            lastLocation={...location};
          }
          if(await queue.add(location,trip,segment)) await flush();
          else render();
        } catch(error) {trackingError=error.message;await pause();}
      };
      const id=prepared ? departureGps.transfer(receive) : await GPS.addWatcher({backgroundTitle:'DriverMan · Suivi de votre course',backgroundMessage:'Trajet GPS enregistré jusqu’au retour.',requestPermissions:true,stale:false,distanceFilter:0},receive);
      if(!enabled||activeId!==trip) await GPS.removeWatcher({id});
      else watcher=id;
    } catch(error) {activeId=null;trackingError=`Le suivi n’a pas pu démarrer : ${error.message}`;}
    render();
  })().finally(()=>{starting=null;});
  return starting;
}

function render() {
  const main=document.querySelector('#main-content');
  if(!main||!currentData) return;
  // Le suivi travaille en arrière-plan ; ses réglages restent dans le menu.
  main.querySelector('.mobile-tracking')?.remove();
  const driver=currentData.user.role==='driver';
  const nav=document.querySelector('.sidebar nav');
  const entry=nav?.querySelector('[data-mobile-tracking]');
  if(driver && nav && !entry) {
    const button=document.createElement('button');
    button.type='button';button.className='nav-link mobile-tracking-link';
    button.setAttribute('data-mobile-tracking','');
    button.innerHTML=`${icon('pin')}<span>Suivi du trajet</span>`;
    nav.append(button);
  } else if(!driver) {
    entry?.remove();
  }
  const panel=document.querySelector('#mobile-tracking-settings');
  if(!panel) return;
  if(!driver) {panel.closest('dialog')?.close();panel.remove();return;}
  panel.querySelector('[data-mobile-status]').textContent=enabled ? (watcher?'Enregistrement en cours':'Activé pendant les courses') : 'Désactivé';
  const toggle=panel.querySelector('[data-mobile-toggle]');
  toggle.textContent=currentDriverTrip()&&watcher?'Actif jusqu’au retour':enabled?'Désactiver le suivi':'Activer le suivi';
  toggle.disabled=Boolean(currentDriverTrip()&&watcher);
  toggle.setAttribute('aria-pressed',String(enabled));
  panel.querySelector('[data-mobile-feedback]').textContent=trackingError||syncNotice;
}

function openTrackingSettings() {
  if(currentData?.user.role!=='driver') return;
  document.querySelector('.sidebar-overlay')?.click();
  openModal('Suivi du trajet','Enregistrez votre itinéraire pendant vos courses.',`<section id="mobile-tracking-settings" class="mobile-tracking-settings"><p class="mobile-tracking-status" data-mobile-status role="status"></p><p>Le GPS est activé pendant la création de votre course. Enregistrez votre retour pour arrêter le suivi.</p><button class="btn primary" type="button" data-mobile-toggle></button><p data-mobile-feedback role="status"></p><details><summary>Options</summary><div class="mobile-tracking-options"><button class="btn secondary" type="button" data-mobile-settings>Autorisations GPS</button><button class="btn secondary" type="button" data-mobile-sync>Synchroniser maintenant</button></div></details></section><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Fermer</button></div>`);
  render();
}

function loginRendered() {
  // L’adresse configurée reste conservée, sans lien technique sous la connexion.
}

document.addEventListener('click',async event=>{
  try {
    const gpsAction=event.target.closest('[data-departure-gps]');
    if(gpsAction&&departureForm) {
      const action=gpsAction.dataset.departureGps;
      if(action==='background') {
        const granted=await TripGps.requestBackground();
        if(granted?.background)await departureGps.begin();
      }
      else if(action==='app-settings')await TripGps.openAppSettings();
      else if(action==='location-settings')await TripGps.openLocationSettings();
      else await departureGps.begin({request:true});
    }
    if(event.target.closest('[data-departure-back]')&&!departureSending) {
      await departureGps.cancel();
      const form=departureForm;departureForm=null;
      form.querySelector('[data-trip-details]').hidden=false;form.querySelector('[data-departure-step]').hidden=true;
      delete form.dataset.gpsStep;
      const submit=form.querySelector('[type="submit"]');submit.disabled=false;submit.innerHTML='Continuer : GPS';
    }
    if(event.target.closest('[data-mobile-tracking]')) openTrackingSettings();
    if(event.target.closest('a[href="api.php?action=export"]')) {
      event.preventDefault();
      const data=await raw('export',undefined,{responseType:'text'});
      const file=await Filesystem.writeFile({path:'driverman-mes-mouvements.csv',data,directory:Directory.Cache,encoding:Encoding.UTF8});
      await Share.share({title:'Mes mouvements DriverMan',files:[file.uri]});
    }
    if(event.target.closest('[data-mobile-toggle]')) {
      if(currentData?.user.role!=='driver') throw new Error('Le suivi GPS des courses est réservé au compte chauffeur.');
      if(currentDriverTrip()&&watcher)throw new Error('Enregistrez votre retour pour arrêter le suivi.');
      trackingError='';
      enabled=!enabled;
      if(enabled&&Capacitor.getPlatform()==='android') {
        const permission=await LocalNotifications.requestPermissions();
        if(permission.display!=='granted') {enabled=false;throw new Error('Autorisez les notifications pour rendre le suivi GPS visible.');}
      }
      await SecureStorage.set(`driverman-gps:${queueOwner}`,enabled,false);
      if(enabled) await start();else await pause();render();
    }
    if(event.target.closest('[data-mobile-sync]')) await flush();
    if(event.target.closest('[data-mobile-settings]')) await GPS.openSettings();
  } catch(error) {trackingError=error.message;render();}
});

const geolocation={
  watchPosition(success,error) {
    const handle={id:null,cancelled:false};
    GPS.addWatcher({requestPermissions:true,stale:false,distanceFilter:0},(position,failure)=>{
      if(handle.cancelled) return;
      if(failure) error({code:failure.code==='NOT_AUTHORIZED'?1:2});
      else if(!position.simulated) success({coords:position,timestamp:position.time});
    }).then(id=>{handle.id=id;if(handle.cancelled) GPS.removeWatcher({id});}).catch(()=>error({code:1}));
    return handle;
  },
  clearWatch(handle) {handle.cancelled=true;if(handle.id) GPS.removeWatcher({id:handle.id});}
};

App.addListener('appStateChange',async({isActive})=>{
  if(isActive&&departureForm?.isConnected&&!departureSending) {
    if(!departureGps.checking)await departureGps.begin();return;
  }
  if(isActive&&settings.token) {try {await loadData();}catch(error){trackingError=error.message;render();}await flush();}
});
document.addEventListener('DOMContentLoaded',()=>document.querySelector('#modal')?.addEventListener('close',()=>{
  if(!departureSending){departureForm=null;departureGps.cancel().catch(()=>{});}
}));
window.addEventListener('online',()=>flush());
async function saveFile(path,data) {
  const text=typeof data==='string';
  const file=await Filesystem.writeFile({path,data:text?data:await base64Data(data),directory:Directory.Cache,...(text?{encoding:Encoding.UTF8}:{})});
  await Share.share({title:'Document DriverMan',files:[file.uri],dialogTitle:'Enregistrer ou partager le document'});
}
window.DriverManMobile={ready,call,onData,render,geolocation,loginRendered,saveFile,departure:{required:departureRequired,step:departureStep,prepare:prepareDeparture},notifications:{configured:pushConfigured,enable:enablePush,disable:disablePush,permission:async()=>pushConfigured?(await PushNotifications.checkPermissions()).receive:'prompt'}};
