<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/app/database.php';
function mysqlTestFixture(string $action): void
{
    $process=proc_open([PHP_BINARY,__DIR__.'/mysql-fixture.php',$action],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
    fclose($pipes[0]);$output=stream_get_contents($pipes[1]).stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);
    if (proc_close($process)!==0) throw new RuntimeException($output);
}
function mysqlTestSetup(): array
{
    $data=sys_get_temp_dir().'/driverman-mysql-test-'.bin2hex(random_bytes(6));mkdir($data,0700);
    putenv('DRIVERMAN_DATA_DIR='.$data);mysqlTestFixture('init');
    $config=json_decode((string)file_get_contents($data.'/database.json'),true,16,JSON_THROW_ON_ERROR);
    return [$data,$config,mysqlConnection($config,$config['database'])];
}
function mysqlCheck(bool $ok,string $label): void {if (!$ok) throw new RuntimeException($label);echo "OK · $label\n";}
