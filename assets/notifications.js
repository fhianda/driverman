'use strict';
window.DriverManNotifications=(()=>{
  let data=null,owner=null,timer=null,pending=false,lastId=null,paintRequested=false;
  let subscribing=false,subscribedOwner=null,retryAfter=0,prompted=false;
  const native=()=>Boolean(window.DriverManMobile);
  const supported=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const current=account=>owner===account&&state.authenticated&&isAdmin()&&state.data.user.id===account;
  function page() { return '<div id="notification-settings" aria-live="polite"><section class="panel notification-loading">Chargement de vos notifications…</section></div>'; }
  function badge() {
    const target=document.querySelector('[data-notification-count]');
    if(target) {target.textContent=data?.unread?String(data.unread):'';target.hidden=!data?.unread;}
  }
  function paint() {
    badge();const target=document.querySelector('#notification-settings');
    if(!target||!data)return;
    const blocked=native()?data.devicePermission==='denied':window.Notification?.permission==='denied';
    target.innerHTML=`<section class="panel notification-history"><div class="panel-heading"><div><h2>Dernières notifications ${data.unread?`<span class="notification-total">${data.unread} non lues</span>`:''}</h2><p>Départs de course et achats de carburant : alertes automatiques.</p>${blocked?'<p role="status">L’autorisation système est refusée sur cet appareil. Les alertes restent consultables ici.</p>':''}</div><button class="text-button" data-notification-read ${data.unread?'':'disabled'}>Tout marquer comme lu</button></div><div class="notification-items">${data.items.length?data.items.map(item=>`<a class="notification-item ${item.read_at?'':'is-unread'}" href="#${item.event==='fuel'?'fuel':'movements'}"><span class="notification-event-icon">${icon(item.event==='fuel'?'fuel':'route')}</span><span><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span><small>${esc(new Date(item.created_at*1000).toLocaleString('fr-FR'))}</small></span>${item.read_at?'':'<span class="notification-unread-dot" aria-label="Non lue"></span>'}</a>`).join(''):'<div class="notification-empty">Aucune notification pour le moment.<p>Les prochains départs et achats apparaîtront automatiquement ici.</p></div>'}</div></section>`;
  }
  async function refresh({render=false}={}) {
    if(render)paintRequested=true;
    if(pending||!state.authenticated||!isAdmin())return;
    pending=true;const account=state.data.user.id;
    try {
      const result=await api('notifications');
      if(native()&&window.DriverManMobile.notifications?.permission)result.devicePermission=await window.DriverManMobile.notifications.permission();
      if(!current(account))return;
      data=result;badge();
      const newest=data.items[0]?.id||0;
      if(lastId!==null&&newest>lastId)toast('Nouvelle notification administrateur.');
      lastId=newest;
      if(paintRequested){paint();paintRequested=false;}
      automaticWeb();
    } catch(error) {if(render&&current(account)){const el=document.querySelector('#notification-settings');if(el)el.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}}
    finally{pending=false;}
  }
  function reset() {
    owner=null;data=null;lastId=null;subscribedOwner=null;retryAfter=0;
    clearInterval(timer);timer=null;
  }
  function onRender() {
    if(!state.authenticated||!isAdmin()){reset();return;}
    if(owner!==state.data.user.id){reset();owner=state.data.user.id;}
    const topbar=document.querySelector('.topbar-right');
    if(topbar&&!topbar.querySelector('.notification-bell'))topbar.insertAdjacentHTML('afterbegin','<a class="notification-bell" href="#notifications" aria-label="Mes notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span data-notification-count hidden></span></a>');
    if(!timer)timer=setInterval(()=>{if(document.visibilityState==='visible')refresh({render:state.page==='notifications'});},30000);
    if(state.page==='notifications')refresh({render:true});else{badge();refresh();}
  }
  async function automaticWeb(permissionResult=null) {
    if(native()||!supported()||!data?.delivery.web||data.demo||subscribing||!current(owner)||subscribedOwner===owner||(!permissionResult&&Date.now()<retryAfter))return;
    if(!permissionResult&&Notification.permission!=='granted')return;
    const account=owner,publicKey=data.delivery.publicKey;
    subscribing=true;retryAfter=Date.now()+30000;
    try {
      if(permissionResult&&await permissionResult!=='granted')return;
      if(!current(account))return;
      let waitTimer;
      const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{waitTimer=setTimeout(()=>reject(Error('Service indisponible.')),10000);})]).finally(()=>clearTimeout(waitTimer));
      if(!current(account))return;
      let sub=await registration.pushManager.getSubscription();
      if(!sub) {
        const encoded=publicKey.replace(/-/g,'+').replace(/_/g,'/');
        const key=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
        sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      }
      if(!current(account))return;
      await api('subscribe-push',{kind:'web',subscription:sub.toJSON()});
      if(current(account))subscribedOwner=account;
    } catch {} // Retry network failures on refresh without another permission prompt.
    finally{subscribing=false;}
  }
  async function beforeLogout() {
    if(native()||!isAdmin())return;
    reset();
    // Server logout removes this session's subscriptions if browser cleanup fails.
    try {if(supported()){const r=await navigator.serviceWorker.getRegistration();await (await r?.pushManager.getSubscription())?.unsubscribe();for(const n of await r?.getNotifications()||[])n.close();}}catch{}
  }
  // Browsers require a real user gesture: use the first interaction after sign-in.
  document.addEventListener('click',event=>{
    if(!event.isTrusted||native()||!supported()||!current(owner)||!data?.delivery.web||data.demo||Notification.permission!=='default')return;
    let dismissed=prompted;
    try{dismissed ||= localStorage.getItem('driverman-notification-prompt')==='shown';}catch{}
    if(dismissed&&!event.target.closest('.notification-bell'))return;
    prompted=true;
    try{localStorage.setItem('driverman-notification-prompt','shown');}catch{}
    automaticWeb(Notification.requestPermission());
  },true);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-notification-read]');
    if(!button||!data)return;
    button.disabled=true;
    try{await api('read-notifications',{through:data.items[0]?.id||0});await refresh({render:true});}
    catch(error){toast(error.message);button.disabled=false;}
  });
  return {page,onRender,refresh,beforeLogout};
})();
