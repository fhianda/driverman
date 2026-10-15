import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomBytes,createECDH} from 'node:crypto';
const php=process.env.PHP_BIN||(process.platform==='win32'?'C:/wamp64/bin/php/php8.4.15/php.exe':'php');
const root=path.resolve('.'),data=await mkdtemp(path.join(tmpdir(),'driverman-alerts-'));
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const env={...process.env,DRIVERMAN_DATA_DIR:data,...(process.platform==='win32'?{OPENSSL_CONF:'C:/wamp64/bin/php/php8.4.15/extras/ssl/openssl.cnf'}:{})};
const dbInit=spawnSync(php,['tests/mysql-fixture.php','init'],{env,windowsHide:true});assert.equal(dbInit.status,0,dbInit.stdout.toString()+dbInit.stderr.toString());
const init=spawnSync(php,['scripts/push-worker.php','--init'],{env,windowsHide:true});assert.equal(init.status,0,init.stderr.toString());
const server=spawn(php,['-S',`127.0.0.1:${port}`,'-t',root],{env,windowsHide:true,stdio:'ignore'});
const base=`http://127.0.0.1:${port}/api.php?action=`;
let checks=0;const ok=(test,label)=>{assert.ok(test,label);checks++;};
class Client {
  cookies=new Map();csrf='';token='';
  async call(action,body){
    const response=await fetch(base+action,{method:body===undefined?'GET':'POST',headers:{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(this.token?{Authorization:`Bearer ${this.token}`}:{ }),'X-CSRF-Token':this.csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()){const [k,...v]=cookie.split(';')[0].split('=');this.cookies.set(k,v.join('='));}
    const result=await response.json();if(result.csrf)this.csrf=result.csrf;return {status:response.status,...result};
  }
}
try {
  for(let i=0;i<40;i++){try{if((await fetch(base+'status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const a=new Client(),b=new Client(),driver=new Client(),guest=new Client();
  await a.call('status');
  const password=randomBytes(24).toString('base64url');
  ok((await a.call('setup',{name:'Admin A',email:'a@example.invalid',password})).status===200,'Setup');await a.call('bootstrap');
  ok((await guest.call('notifications')).status===401,'Historique privé');
  const initial=await a.call('notifications');ok(initial.preferences.departure==='both'&&initial.preferences.fuel==='both','Alertes automatiques sans préférences enregistrées');
  ok(initial.delivery.web&&!initial.delivery.android&&!JSON.stringify(initial).includes('privateKey'),'Seule la clé publique est exposée');
  ok((await a.call('save-notification-preferences',{departure:'both',fuel:'invalid'})).status===409,'Ancien écran de préférences retiré');
  ok((await a.call('notifications')).preferences.departure==='both','Les alertes restent automatiques');
  const csrf=a.csrf;a.csrf='incorrect';
  ok((await a.call('save-notification-preferences',{departure:'both',fuel:'both'})).status===403,'Préférences protégées par CSRF');a.csrf=csrf;
  await a.call('save-notification-preferences',{departure:'both',fuel:'vibrate'});
  await a.call('create-user',{role:'admin',name:'Admin B',email:'b@example.invalid',password});
  await b.call('status');await b.call('login',{email:'b@example.invalid',password});await b.call('bootstrap');
  await b.call('save-notification-preferences',{departure:'off',fuel:'silent'});
  await a.call('save-driver',{id:0,name:'Chauffeur Test',phone:'000',license:'NOTIF001',license_expiry:'2035-12-31',status:'available'});
  await a.call('save-vehicle',{id:0,plate:'NOTIF-001',make:'Toyota',model:'Hilux',type:'Pick-up',fuel:'Diesel',mileage:100,status:'available'});
  await a.call('create-user',{role:'driver',driver_id:1,email:'driver@example.invalid',password});
  await driver.call('status');await driver.call('login',{email:'driver@example.invalid',password});await driver.call('bootstrap');
  for(const [action,body] of [['notifications',undefined],['save-notification-preferences',{departure:'both',fuel:'both'}],['read-notifications',{through:10}],['subscribe-push',{kind:'android',token:'a'.repeat(30)}],['unsubscribe-push',{}]])ok((await driver.call(action,body)).status===403,`Chauffeur interdit: ${action}`);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' ','T');
  const departure={driver_id:1,vehicle_id:1,start_at:now,start_km:100,destination:'Destination test',purpose:'Mission de service'};
  ok((await driver.call('depart',departure)).status===200,'Départ enregistré');
  ok((await driver.call('depart',departure)).status===422,'Doublon métier refusé');
  let status=await a.call('notifications');ok(status.items.length===1&&status.unread===1&&status.items[0].body.includes('NOTIF-001'),'Une alerte pour le départ');
  ok((await b.call('notifications')).items.length===1,'Admin B reçoit automatiquement le départ');
  const fuel={vehicle_id:1,filled_at:now,mileage:100,liters:'10',unit_price:'2',currency:'USD',full_tank:'0'};
  ok((await driver.call('save-refueling',fuel)).status===200,'Achat enregistré');
  ok((await driver.call('save-refueling',fuel)).status===409,'Doublon carburant refusé');
  status=await a.call('notifications');ok(status.items.length===2&&status.items[0].body.includes('20,00 USD'),'Deux alertes avec montant correct');
  const bStatus=await b.call('notifications');ok(bStatus.items.length===2&&bStatus.items[0].event==='fuel','Les deux événements arrivent chez chaque administrateur');
  await a.call('read-notifications',{through:status.items[0].id});ok((await a.call('notifications')).unread===0,'Lecture persistée');
  ok((await b.call('notifications')).unread===2,'Lecture ne modifie pas l’autre compte');
  const ecdh=createECDH('prime256v1');ecdh.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fake-test-token',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.invalid/a','https://fcm.googleapis.com:8443/a','https://user@fcm.googleapis.com/a'])ok((await a.call('subscribe-push',{kind:'web',subscription:{...subscription,endpoint}})).status===422,'Endpoint dangereux refusé');
  ok((await a.call('subscribe-push',{kind:'web',subscription})).status===200,'Abonnement Web Push');
  ok((await a.call('notifications')).devices.length===1,'Appareil lié à la session');
  ok((await a.call('subscribe-push',{kind:'web',subscription})).status===200&&(await a.call('notifications')).devices.length===1,'Abonnement idempotent');
  await b.call('subscribe-push',{kind:'web',subscription});
  ok((await a.call('notifications')).devices.length===0&&(await b.call('notifications')).devices.length===1,'Un appareil n’est attribué qu’à un compte');
  await a.call('subscribe-push',{kind:'web',subscription});
  ok((await a.call('subscribe-push',{kind:'android',token:'a'.repeat(30)})).status===503,'Android indisponible sans Firebase');
  await a.call('logout',{});await a.call('status');await a.call('login',{email:'a@example.invalid',password});await a.call('bootstrap');
  ok((await a.call('notifications')).devices.length===0,'Déconnexion supprime la réception');
  ok((await a.call('notifications')).preferences.fuel==='both','Alertes automatiques après reconnexion');
  // Queue, retries and cryptography exercised without contacting any real push provider.
  const unit=spawnSync(php,['tests/push-queue.php'],{env,windowsHide:true});assert.equal(unit.status,0,unit.stdout.toString()+unit.stderr.toString());
  console.log(`${checks} contrôles API notifications réussis. ${unit.stdout.toString().trim()}`);
 } finally { server.kill(); const cleanup=spawnSync(php,['tests/mysql-fixture.php','cleanup'],{env,windowsHide:true});assert.equal(cleanup.status,0,cleanup.stdout.toString()+cleanup.stderr.toString()); }
