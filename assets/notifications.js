'use strict';
window.DriverManNotifications=(()=>{
  let data=null,owner=null,timer=null,pending=false,lastId=null,paintRequested=false;
  let subscribing=false,subscribedOwner=null,retryAfter=0,prompted=false;
  let reading=null,readVersion=0,opening=null;
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
    target.innerHTML=`<section class="panel notification-history"><div class="panel-heading"><div><h2>Dernières notifications ${data.unread?`<span class="notification-total">${data.unread} non lues</span>`:''}</h2><p>Départs de course et achats de carburant : alertes automatiques.</p>${blocked?'<p role="status">L’autorisation système est refusée sur cet appareil. Les alertes restent consultables ici.</p>':''}</div><button class="text-button" data-notification-read ${data.unread?'':'disabled'}>Tout marquer comme lu</button></div><div class="notification-items">${data.items.length?data.items.map(item=>`<a data-notification-id="${item.id}" class="notification-item ${item.read_at?'':'is-unread'}" href="#${item.event==='fuel'?'fuel':'movements'}"><span class="notification-event-icon">${icon(item.event==='fuel'?'fuel':'route')}</span><span><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span><small>${esc(new Date(item.created_at*1000).toLocaleString('fr-FR'))}</small></span>${item.read_at?'':'<span class="notification-unread-dot" aria-label="Non lue"></span>'}</a>`).join(''):'<div class="notification-empty">Aucune notification pour le moment.<p>Les prochains départs et achats apparaîtront automatiquement ici.</p></div>'}</div></section>`;
  }
  async function refresh({render=false}={}) {
    if(render)paintRequested=true;
    if(pending||reading||!state.authenticated||!isAdmin())return;
    pending=true;const account=state.data.user.id,version=readVersion;
    try {
      const result=await api('notifications');
      if(native()&&window.DriverManMobile.notifications?.permission)result.devicePermission=await window.DriverManMobile.notifications.permission();
      if(!current(account)||version!==readVersion)return;
      data=result;badge();
      const newest=data.items[0]?.id||0;
      if(lastId!==null&&newest>lastId)toast('Nouvelle notification administrateur.');
      lastId=newest;
      if(paintRequested){paint();paintRequested=false;markVisible();}
      automaticWeb();
    } catch(error) {if(render&&current(account)&&version===readVersion){const el=document.querySelector('#notification-settings');if(el)el.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}}
    finally{pending=false;}
  }
  function reset() {
    owner=null;data=null;lastId=null;subscribedOwner=null;retryAfter=0;
    readVersion++;opening=null;
    clearInterval(timer);timer=null;
  }
  function onRender() {
    if(!state.authenticated||!isAdmin()){reset();return;}
    if(owner!==state.data.user.id){reset();owner=state.data.user.id;}
    const topbar=document.querySelector('.topbar-right');
    if(topbar&&!topbar.querySelector('.notification-bell'))topbar.insertAdjacentHTML('afterbegin','<a class="notification-bell" href="#notifications" aria-label="Mes notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span data-notification-count hidden></span></a>');
    if(!timer)timer=setInterval(()=>{if(document.visibilityState==='visible')refresh({render:state.page==='notifications'});},30000);
    readOpened();
    if(state.page==='notifications')refresh({render:true});else{badge();refresh();}
  }
  async function markRead(input) {
    const account=owner;
    while(reading)await reading;
    if(!current(account))return false;
    if(input.ids) {
      input={ids:input.ids.filter(id=>!data?.items.some(item=>item.id===id&&item.read_at))};
      if(!input.ids.length)return true;
    }
    const version=++readVersion;
    reading=(async()=>{
      try {
        const result=await api('read-notifications',input);
        if(!current(account)||version!==readVersion)return false;
        result.devicePermission=data?.devicePermission;
        data=result;badge();
        if(state.page==='notifications'){paint();paintRequested=false;}
        return true;
      } catch(error) {if(current(account))toast('Lecture non enregistrée. '+error.message);return false;}
    })().finally(()=>{reading=null;});
    return reading;
  }
  function markVisible() {
    if(reading||!data||state.page!=='notifications'||document.visibilityState!=='visible'||!document.querySelector('#notification-settings'))return;
    const ids=data.items.filter(item=>!item.read_at).map(item=>item.id);
    if(ids.length)markRead({ids});
  }
  const notificationId=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):null;
  function readOpened() {
    const id=notificationId(new URL(location.href).searchParams.get('notification'));
    if(!id||opening===id||!current(owner))return;
    const account=owner;opening=id;
    markRead({ids:[id]}).then(saved=>{
      if(!current(account))return;
      const url=new URL(location.href);
      if(saved&&notificationId(url.searchParams.get('notification'))===id) {
        url.searchParams.delete('notification');history.replaceState(null,'',url.pathname+url.search+url.hash);
      }
      if(opening===id)opening=null;
    });
  }
  function open(id,page) {
    const url=new URL(location.href);
    id=notificationId(id);
    if(id)url.searchParams.set('notification',String(id));else url.searchParams.delete('notification');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    location.hash=['fuel','movements'].includes(page)?page:'notifications';
    readOpened();
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
    const item=event.target.closest('[data-notification-id]');
    if(item) {const id=notificationId(item.dataset.notificationId);if(id)await markRead({ids:[id]});return;}
    if(!button||!data)return;
    button.disabled=true;
    if(!await markRead({through:data.items[0]?.id||0}))button.disabled=false;
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){readOpened();refresh({render:state.page==='notifications'});}});
  return {page,onRender,refresh,beforeLogout,open};
})();
