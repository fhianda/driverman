'use strict';

// Cache limité à la page hors connexion et aux icônes publiques.
// Aucun écran connecté, appel API, rapport ou photo du parc n'est conservé.
const prefix=`driverman-public-${self.registration.scope}-`;
const cacheName=prefix+'v1';
const publicFiles=['offline.html','assets/pwa/icon-192.png','assets/pwa/icon-512.png','assets/pwa/icon-maskable-512.png'].map(file=>new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(publicFiles)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||!url.href.startsWith(self.registration.scope)||url.origin!==self.location.origin) return;
  if(url.pathname.endsWith('/api.php')) return;
  if(request.mode==='navigate') event.respondWith(fetch(request).catch(()=>caches.open(cacheName).then(cache=>cache.match(publicFiles[0]))));
  else if(publicFiles.includes(url.href)) event.respondWith(caches.open(cacheName).then(async cache=>(await cache.match(request))||fetch(request)));
});
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data;try{data=event.data?.json();}catch{}
    if(!data||!/^\d+$/.test(String(data.id)))return;
    const options={body:String(data.body||'').slice(0,500),icon:new URL('assets/pwa/icon-192.png',self.registration.scope).href,
      tag:'driverman-'+data.id,data:{id:String(data.id),page:['fuel','movements'].includes(data.page)?data.page:'notifications'}};
    if(data.mode==='silent')options.silent=true;
    else if(['vibrate','both'].includes(data.mode))options.vibrate=[200,100,200];
    else options.vibrate=[];
    await self.registration.showNotification(String(data.title||'DriverMan').slice(0,120),options);
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const page=event.notification.data?.page;
  const targetUrl=new URL('#'+(['fuel','movements'].includes(page)?page:'notifications'),self.registration.scope);
  // Older displayed notifications have only the stable tag, not data.id.
  const id=event.notification.data?.id||String(event.notification.tag||'').replace(/^driverman-/,'');
  if(/^[1-9]\d*$/.test(String(id))&&Number.isSafeInteger(Number(id)))targetUrl.searchParams.set('notification',String(id));
  const target=targetUrl.href;
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) {
      if(client.url.startsWith(self.registration.scope)) {await client.navigate(target);return client.focus();}
    }
    return self.clients.openWindow(target);
  })());
});
