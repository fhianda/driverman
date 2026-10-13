'use strict';
window.DriverManNotifications=(()=>{
  let data=null,owner=null,timer=null,pending=false,lastId=null,paintRequested=false;
  const labels={departure:'Départ d’une course',fuel:'Achat de carburant'};
  const modes={off:'Désactivée',both:'Son et vibration',sound:'Son',vibrate:'Vibreur',silent:'Silencieuse'};
  const native=()=>Boolean(window.DriverManMobile);
  const supported=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  function page() { return '<div id="notification-settings" aria-live="polite"><section class="panel notification-loading">Chargement de vos notifications…</section></div>'; }
  function badge() {
    const target=document.querySelector('[data-notification-count]');
    if(target) {target.textContent=data?.unread?String(data.unread):'';target.hidden=!data?.unread;}
  }
  function paint() {
    badge();const target=document.querySelector('#notification-settings');
    if(!target||!data) return;
    const kind=native()?'android':'web';
    const allowed=native()?true:supported();
    const ready=Boolean(data.delivery[kind])&&(!native()||window.DriverManMobile.notifications?.configured);
    const registered=data.devices.some(d=>d.kind===kind);
    const blocked=native()?data.devicePermission==='denied':window.Notification?.permission==='denied';
    const active=registered&&!blocked;
    let status=active?'Réception activée sur cet appareil':blocked?'Notifications bloquées sur cet appareil':!allowed?'Installation ou navigateur compatible nécessaire':!ready?'Service à distance à configurer':'Réception non activée sur cet appareil';
    let explanation=active?'Les alertes choisies sont envoyées même lorsque DriverMan est fermé, avec une connexion Internet.':blocked?'Autorisez les notifications de DriverMan dans les réglages du navigateur ou du téléphone, puis réactivez la réception.':!allowed?'Sur iPhone (iOS 16.4 ou ultérieur), installez DriverMan sur l’écran d’accueil depuis Safari, puis ouvrez cette application pour autoriser les notifications.':!ready?(native()?'La réception Android attend la configuration du service de notifications. Vos préférences et votre historique restent disponibles.':'La réception à distance doit être activée sur le serveur. Vos préférences et votre historique restent disponibles.'):'Autorisez DriverMan à vous envoyer les alertes sélectionnées, même lorsque cette application est fermée.';
    if(data.demo){status='Aperçu des préférences';explanation='Connectez-vous à votre compte administrateur pour recevoir de vraies notifications.';}
    target.innerHTML=`<div class="notification-grid"><section class="panel notification-preferences"><div class="panel-heading"><div><h2>Mes alertes</h2><p>Vos choix s’appliquent à votre compte administrateur.</p></div></div><form id="notification-form">${Object.entries(labels).map(([event,label])=>`<div class="notification-choice"><div class="notification-event-icon">${icon(event==='fuel'?'fuel':'route')}</div><div><label for="notification-${event}">${label}</label><p>${event==='fuel'?'À chaque nouvel achat enregistré dans le parc.':'Lorsqu’un départ est enregistré pour un chauffeur.'}</p></div><select id="notification-${event}" name="${event}" class="select select-bordered">${Object.entries(modes).map(([mode,text])=>`<option value="${mode}" ${data.preferences[event]===mode?'selected':''}>${text}</option>`).join('')}</select></div>`).join('')}<div class="notification-form-footer"><p>Les alertes commencent après activation. Les événements antérieurs ne sont pas renvoyés.</p><button class="btn primary" type="submit">Enregistrer mes choix</button></div><p id="notification-feedback" role="status"></p></form></section><section class="panel notification-device"><span class="eyebrow">CET APPAREIL</span><h2>${esc(status)}</h2><p>${esc(explanation)}</p><button class="btn secondary" data-notification-device="${active?'disable':'enable'}" ${data.demo||(!active&&(!allowed||!ready||blocked))?'disabled':''}>${active?'Désactiver sur cet appareil':'Activer sur cet appareil'}</button><div class="notification-device-note"><strong>Son, vibreur et mode silencieux</strong><p>Android applique le mode choisi, selon les réglages du téléphone et « Ne pas déranger ». Sur iPhone et dans un navigateur, le système décide du son et de la vibration ; ces deux options ne sont pas toujours réglables séparément.</p></div></section></div><section class="panel notification-history"><div class="panel-heading"><div><h2>Dernières notifications ${data.unread?`<span class="notification-total">${data.unread} non lues</span>`:''}</h2><p>Les 50 dernières alertes, conservées pendant 90 jours.</p></div><button class="text-button" data-notification-read ${data.unread?'':'disabled'}>Tout marquer comme lu</button></div><div class="notification-items">${data.items.length?data.items.map(item=>`<a class="notification-item ${item.read_at?'':'is-unread'}" href="#${item.event==='fuel'?'fuel':'movements'}"><span class="notification-event-icon">${icon(item.event==='fuel'?'fuel':'route')}</span><span><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span><small>${esc(new Date(item.created_at*1000).toLocaleString('fr-FR'))}</small></span>${item.read_at?'':'<span class="notification-unread-dot" aria-label="Non lue"></span>'}</a>`).join(''):'<div class="notification-empty">Aucune notification pour le moment.<p>Activez les événements qui vous intéressent : les prochaines alertes apparaîtront ici.</p></div>'}</div></section>`;
  }
  async function refresh({render=false}={}) {
    if(render)paintRequested=true;
    if(pending||!state.authenticated||!isAdmin())return;
    pending=true;const account=state.data.user.id;
    try {
      const result=await api('notifications');
      if(!state.authenticated||!isAdmin()||state.data.user.id!==account)return;
      if(native()&&window.DriverManMobile.notifications?.permission)result.devicePermission=await window.DriverManMobile.notifications.permission();
      data=result;badge();
      const newest=data.items[0]?.id||0;
      if(lastId!==null&&newest>lastId)toast('Nouvelle notification administrateur.');
      lastId=newest;
      if(paintRequested){paint();paintRequested=false;}
    } catch(error) {if(render){const el=document.querySelector('#notification-settings');if(el)el.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}}
    finally{pending=false;}
  }
  function onRender() {
    if(!state.authenticated||!isAdmin()){owner=null;data=null;lastId=null;clearInterval(timer);timer=null;return;}
    if(owner!==state.data.user.id){owner=state.data.user.id;data=null;lastId=null;}
    const topbar=document.querySelector('.topbar-right');
    if(topbar&&!topbar.querySelector('.notification-bell'))topbar.insertAdjacentHTML('afterbegin','<a class="notification-bell" href="#notifications" aria-label="Mes notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span data-notification-count hidden></span></a>');
    if(!timer)timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
    if(state.page==='notifications')refresh({render:true});else{badge();refresh();}
  }
  async function enable() {
    if(native())return window.DriverManMobile.notifications.enable();
    if(await Notification.requestPermission()!=='granted')throw Error('L’autorisation de notification n’a pas été accordée.');
    let waitTimer;
    const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{waitTimer=setTimeout(()=>reject(Error('Le service de notification du navigateur n’est pas prêt. Actualisez la page puis réessayez.')),10000);})]).finally(()=>clearTimeout(waitTimer));
    let sub=await registration.pushManager.getSubscription();
    if(!sub) {
      const encoded=data.delivery.publicKey.replace(/-/g,'+').replace(/_/g,'/');
      const key=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
      sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    }
    await api('subscribe-push',{kind:'web',subscription:sub.toJSON()});
  }
  async function disable() {
    await api('unsubscribe-push',{});
    if(native())await window.DriverManMobile.notifications.disable();
    else if(supported()) {
      const registration=await navigator.serviceWorker.getRegistration();
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      for(const notification of await registration?.getNotifications()||[])notification.close();
    }
  }
  async function beforeLogout() {
    if(native()||!isAdmin())return;
    // Server logout also removes this session's subscriptions, even if browser cleanup fails.
    try {if(supported()){const r=await navigator.serviceWorker.getRegistration();await (await r?.pushManager.getSubscription())?.unsubscribe();for(const n of await r?.getNotifications()||[])n.close();}}catch{}
    owner=null;data=null;lastId=null;clearInterval(timer);timer=null;
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='notification-form')return;
    event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
    try{await api('save-notification-preferences',Object.fromEntries(new FormData(form)));await refresh({render:true});toast('Vos choix de notification sont enregistrés.');}
    catch(error){form.querySelector('#notification-feedback').textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const device=event.target.closest('[data-notification-device]'),read=event.target.closest('[data-notification-read]');
    if(!device&&!read)return;const button=device||read;button.disabled=true;
    try{if(device){if(device.dataset.notificationDevice==='enable')await enable();else await disable();}else await api('read-notifications',{through:data.items[0]?.id||0});await refresh({render:true});}
    catch(error){toast(error.message);button.disabled=false;}
  });
  return {page,onRender,refresh,beforeLogout};
})();
