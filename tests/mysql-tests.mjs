import {spawnSync} from 'node:child_process';
const php=process.env.PHP_BIN||(process.platform==='win32'?'C:/wamp64/bin/php/php8.4.15/php.exe':'php');
for(const file of ['tests/mysql-migration.php','tests/mysql-concurrency.php']) {
  const result=spawnSync(php,[file],{stdio:'inherit',windowsHide:true});
  if(result.status!==0)process.exit(result.status||1);
}
