// Serveur de vérification isolé. Fermer avec Ctrl+C une fois la revue terminée.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
const data=await mkdtemp(path.join(tmpdir(),'driverman-gps-preview-'));
const versions=(await readdir('C:/wamp64/bin/php')).filter(v=>v.startsWith('php8.')).sort().reverse();
const php=`C:/wamp64/bin/php/${versions[0]}/php.exe`;
const environment={...process.env,DRIVERMAN_DATA_DIR:data};
const init=spawnSync(php,['tests/mysql-fixture.php','init'],{env:environment,windowsHide:true});
if(init.status!==0)throw Error('Impossible de préparer la base isolée.');
const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const server=spawn(php,['-S',`127.0.0.1:${port}`,'-t',process.cwd()],{env:environment,windowsHide:true,stdio:'ignore'});
process.on('SIGINT',()=>{server.kill();process.exit();});process.on('exit',()=>{server.kill();spawnSync(php,['tests/mysql-fixture.php','cleanup'],{env:environment,windowsHide:true});});
const base=`http://127.0.0.1:${port}/`;
let cookie='',csrf='';
async function call(action,body) {
  const response=await fetch(`${base}api.php?action=${action}`,{method:body?'POST':'GET',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const set=response.headers.getSetCookie();if(set.length) cookie=set[set.length-1].split(';')[0];
  const result=await response.json();if(result.csrf)csrf=result.csrf;if(!response.ok)throw Error(result.error);return result;
}
for(let attempt=0;attempt<50;attempt++){try{await call('status');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
await call('setup',{name:'Vérification locale',email:'qa@example.invalid',password:'Local-Preview-Only-2026'});
await call('bootstrap');
await call('save-driver',{id:0,name:'Chauffeur de test',phone:'000',license:'QA-001',license_expiry:'2035-01-01',status:'available'});
await call('save-vehicle',{id:0,plate:'QA GPS 001',make:'Toyota',model:'Hilux',type:'Pick-up',fuel:'Diesel',mileage:1000,status:'available'});
const local=offset=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Date.now()+offset*60000)).replace(' ','T');
await call('depart',{driver_id:1,vehicle_id:1,destination:'Trajet fictif de vérification',purpose:'Mission de service',start_at:local(-20),expected_return:'',start_km:1000,notes:'Données synthétiques de test'});
await call('create-user',{role:'driver',driver_id:1,email:'qa-driver@example.invalid',password:'Local-Preview-Only-2026'});
await call('login',{email:'qa-driver@example.invalid',password:'Local-Preview-Only-2026'});await call('bootstrap');
await call('save-positions',{movement_id:1,points:Array.from({length:8},(_,i)=>({sample_id:crypto.randomUUID(),segment_id:i<4?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',recorded_at:Date.now()-600000+i*60000,latitude:i<4?-4.325+i*.0003:-4.373+(i-4)*.0003,longitude:i<4?15.322+i*.0005:15.294+(i-4)*.0005,accuracy:8}))});
await call('return',{id:1,end_at:local(0),end_km:1005});
console.log(`Serveur de vérification : ${base}`);
await new Promise(()=>{});
