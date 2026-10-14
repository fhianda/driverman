<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') exit(1);
require __DIR__.'/mysql-test-tools.php';
[$data,$config,$a]=mysqlTestSetup();
define('DRIVERMAN_NATIVE_REQUEST',true);require dirname(__DIR__).'/app/bootstrap.php';
try {
    $b=mysqlConnection($config,$config['database']);$b->exec('SET SESSION innodb_lock_wait_timeout=1');
    $a->beginTransaction();$a->query('SELECT id FROM app_write_lock WHERE id=1 FOR UPDATE')->fetchColumn();
    $blocked=false;
    try {transaction($b,fn()=>$b->exec("INSERT INTO app_settings VALUES('concurrent','bad')"));}
    catch(PDOException $e){$blocked=($e->errorInfo[1]??0)===1205;}
    mysqlCheck($blocked&&!$b->inTransaction(),'Écritures simultanées sérialisées et transaction en attente annulée proprement');
    $a->commit();
    mysqlCheck((int)$b->query('SELECT COUNT(*) FROM app_settings')->fetchColumn()===0,'Aucune écriture partielle après un conflit');
    transaction($b,fn()=>$b->exec("INSERT INTO app_settings VALUES('concurrent','ok')"));
    mysqlCheck($a->query('SELECT value FROM app_settings')->fetchColumn()==='ok','Écriture possible après libération du verrou');
    $a->exec("INSERT INTO drivers(name,phone,license,license_expiry) VALUES('A','0','A','2035-01-01'),('B','0','B','2035-01-01')");
    $a->exec("INSERT INTO vehicles(plate,make,model,type,fuel) VALUES('A','A','A','SUV','Diesel'),('B','B','B','SUV','Diesel')");
    $trip=$a->prepare("INSERT INTO movements(driver_id,vehicle_id,destination,purpose,start_at,expected_return,start_km) VALUES(?,?,'Essai','Mission de service','2026-10-13 10:00:00','',0)");
    $trip->execute([1,1]);
    foreach ([[1,2],[2,1]] as $pair) {
        $rejected=false;try{$trip->execute($pair);}catch(PDOException $e){$rejected=($e->errorInfo[1]??0)===1062;}
        mysqlCheck($rejected,'Double affectation rejetée par la contrainte MySQL');
    }
    $a->exec("UPDATE movements SET end_at='2026-10-13 11:00:00',end_km=5 WHERE id=1");$trip->execute([1,1]);
    mysqlCheck((int)$a->query('SELECT COUNT(*) FROM movements')->fetchColumn()===2,'Ressources libérées au retour sans perdre leur historique');
    $foreign=false;try{$trip->execute([999,999]);}catch(PDOException $e){$foreign=($e->errorInfo[1]??0)===1452;}
    mysqlCheck($foreign,'Références inexistantes rejetées');
    $negative=false;try{$a->exec('UPDATE vehicles SET mileage=-1 WHERE id=1');}catch(PDOException $e){$negative=($e->errorInfo[1]??0)===3819;}
    mysqlCheck($negative,'Compteur négatif rejeté par MySQL');
} finally {if ($a->inTransaction())$a->rollBack();mysqlTestFixture('cleanup');}
