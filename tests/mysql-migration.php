<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') exit(1);
require __DIR__.'/mysql-test-tools.php';
require dirname(__DIR__).'/scripts/mysql-migration.php';
[$data,$config,$db]=mysqlTestSetup();
try {
    $original=getenv('DRIVERMAN_TEST_SQLITE_SOURCE');
    if (!$original) {
        $original=$data.'/source.sqlite';$sqlite=new PDO('sqlite:'.$original);
        $sqlite->exec("CREATE TABLE drivers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,license TEXT NOT NULL UNIQUE,license_expiry TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'available');
            CREATE TABLE vehicles(id INTEGER PRIMARY KEY,plate TEXT NOT NULL UNIQUE,make TEXT NOT NULL,model TEXT NOT NULL,type TEXT NOT NULL,fuel TEXT NOT NULL,mileage INTEGER NOT NULL,status TEXT NOT NULL);
            CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL);
            CREATE TABLE resource_photos(resource_type TEXT NOT NULL,resource_id INTEGER NOT NULL,version TEXT NOT NULL,content BLOB NOT NULL,PRIMARY KEY(resource_type,resource_id));
            CREATE TABLE refuelings(id INTEGER PRIMARY KEY,vehicle_id INTEGER NOT NULL,filled_at TEXT NOT NULL,mileage INTEGER NOT NULL,liters_ml INTEGER NOT NULL,unit_price_milli INTEGER NOT NULL,currency TEXT NOT NULL,latitude REAL,longitude REAL,accuracy REAL);
            INSERT INTO drivers VALUES(7,'Élève 🚐','000','MIG-007','2035-12-31','available');
            INSERT INTO vehicles VALUES(12,'MIG-012','Toyota','Essai','SUV','Diesel',100,'available');
            INSERT INTO refuelings VALUES(91,12,'2026-10-13 10:00:00',100,12345,12340000,'CDF',-4.123456789012345,15.322,93.5)");
        $password=password_hash('Test de migration uniquement',PASSWORD_DEFAULT);
        $sqlite->prepare('INSERT INTO users VALUES(5,?,?,?)')->execute(['Administrateur','test@example.invalid',$password]);
        $photo="\x00\xff\x01'image\x00"; $insert=$sqlite->prepare('INSERT INTO resource_photos VALUES(?,?,?,?)');
        $insert->bindValue(1,'vehicle');$insert->bindValue(2,12,PDO::PARAM_INT);$insert->bindValue(3,'version');$insert->bindValue(4,$photo,PDO::PARAM_LOB);$insert->execute();
        unset($sqlite);
    }
    sqliteBackup($original,$data.'/snapshot.sqlite');
    $before=hash_file('sha256',$data.'/snapshot.sqlite');
    $report=migrateSqliteData($data.'/snapshot.sqlite',$db);
    mysqlCheck(hash_file('sha256',$data.'/snapshot.sqlite')===$before,'Source et sauvegarde inchangées après migration');
    mysqlCheck(array_sum(array_column($report,'rows'))>0,'Lignes et empreintes de toutes les tables vérifiées');
    $refused=false;try {migrateSqliteData($data.'/snapshot.sqlite',$db);}catch(RuntimeException){$refused=true;}
    mysqlCheck($refused,'Une destination déjà remplie ne peut pas être écrasée');
    if (!getenv('DRIVERMAN_TEST_SQLITE_SOURCE')) {
        mysqlCheck($db->query('SELECT content FROM resource_photos')->fetchColumn()===$photo,'Photos binaires préservées');
        $user=$db->query('SELECT * FROM users')->fetch();
        mysqlCheck($user['id']===5&&$user['password']===$password&&password_verify('Test de migration uniquement',$user['password']),'Identifiants et mots de passe conservés');
        mysqlCheck($user['role']==='admin'&&$user['driver_id']===null,'Anciennes installations complétées sans perte');
        $db->exec("INSERT INTO drivers(name,phone,license,license_expiry) VALUES('Suivant','0','MIG-008','2035-01-01')");
        mysqlCheck((int)$db->lastInsertId()===8,'Auto-incrément repris après les identifiants importés');
    }
    echo array_sum(array_column($report,'rows'))." lignes vérifiées sur MySQL.\n";
} finally { mysqlTestFixture('cleanup'); }
