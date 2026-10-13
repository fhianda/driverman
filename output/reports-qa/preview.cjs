const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const net=require('node:net');
(async()=>{
const root=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'driverman-reports-qa-')),php='C:/wamp64/bin/php/php8.4.15/php.exe';
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(php,['-S',`127.0.0.1:${port}`,'-t',root],{cwd:root,env:{...process.env,DRIVERMAN_DATA_DIR:dir},windowsHide:true,stdio:'ignore'});
const base=`http://127.0.0.1:${port}/`;let csrf='',cookies=new Map();
async function call(action,body){const response=await fetch(base+'api.php?action='+action,{method:body?'POST':'GET',headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});for(const c of response.headers.getSetCookie()){const [k,...v]=c.split(';')[0].split('=');cookies.set(k,v.join('='));}const result=await response.json();if(result.csrf)csrf=result.csrf;if(!response.ok)throw Error(JSON.stringify(result));return result;}
try{
for(let i=0;i<40;i++){try{await call('status');break;}catch{await new Promise(r=>setTimeout(r,100));}}
await call('setup',{name:'Vérification des rapports',email:'rapports@example.invalid',password:'Rapports-Local-2026!'});
const fixture=require('../../tests/report-fixture.cjs');await fs.writeFile(path.join(dir,'fixture.json'),JSON.stringify(fixture));
await fs.writeFile(path.join(dir,'seed.php'),`<?php
require $argv[1]; $db=database();$f=json_decode(file_get_contents($argv[2]),true);
$db->exec("INSERT INTO drivers(id,name,phone,license,license_expiry) VALUES(1,'Élodie Mbuyi','000','QA001','2030-12-31'),(2,'Jean Mukendi','000','QA002','2030-12-31')");
$db->exec("INSERT INTO vehicles(id,plate,make,model,type,fuel,mileage,deleted_at) VALUES(1,'TEST 001','Toyota','Hilux','Pick-up','Diesel',1600,NULL),(2,'RETIRÉ 002','Toyota','Prado','SUV','Diesel',1200,'2026-03-01')");
foreach(['movements'=>['id','driver_id','vehicle_id','destination','purpose','start_at','expected_return','start_km','end_at','end_km'],'refuelings'=>['id','vehicle_id','filled_at','mileage','liters_ml','unit_price_milli','currency','full_tank','station']] as $table=>$cols) { $sql='INSERT INTO '.$table.'('.implode(',',$cols).') VALUES('.implode(',',array_fill(0,count($cols),'?')).')';foreach($f[$table==='movements'?'movements':'refuelings'] as $r){$r['expected_return']='';$db->prepare($sql)->execute(array_map(fn($c)=>$r[$c],$cols));}}
`);
const seed=spawnSync(php,[path.join(dir,'seed.php'),path.join(root,'app/bootstrap.php'),path.join(dir,'fixture.json')],{env:{...process.env,DRIVERMAN_DATA_DIR:dir},windowsHide:true});if(seed.status!==0)throw Error(seed.stderr.toString());
await fs.writeFile(path.join(root,'output/reports-qa/preview.json'),JSON.stringify({base,dir,port}));console.log(JSON.stringify({base,dir}));
const timer=setInterval(async()=>{try{await fs.access(path.join(dir,'stop'));clearInterval(timer);server.kill();}catch{}},1000);
}catch(e){server.kill();throw e;}
})();
