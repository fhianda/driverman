<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/app/database.php';
require __DIR__.'/mysql-migration.php';

$options=getopt('', ['data-dir:','database:','deploy-to:']);
$gate=null; $deployed=[]; $backupDir=null; $activated=false;
try {
    $data=realpath($options['data-dir'] ?? '');
    $name=$options['database'] ?? 'driverman';
    if (!$data || !is_file($data.'/driverman.sqlite')) throw new RuntimeException('Indiquer --data-dir avec la base SQLite existante.');
    if (!preg_match('/^[a-z][a-z0-9_]{0,23}$/D',$name)) throw new RuntimeException('Nom de base incorrect.');
    if (file_exists($data.'/database.json')) throw new RuntimeException('Une configuration MySQL existe déjà : aucune modification effectuée.');
    $admin=['host'=>getenv('DRIVERMAN_MYSQL_ADMIN_HOST') ?: '127.0.0.1','port'=>(int)(getenv('DRIVERMAN_MYSQL_ADMIN_PORT') ?: 3306),
        'username'=>getenv('DRIVERMAN_MYSQL_ADMIN_USER') ?: 'root','password'=>getenv('DRIVERMAN_MYSQL_ADMIN_PASSWORD') ?: ''];
    $db=mysqlConnection($admin);
    if (str_contains($db->getAttribute(PDO::ATTR_SERVER_VERSION),'MariaDB') || version_compare($db->getAttribute(PDO::ATTR_SERVER_VERSION),'8.4','<')) throw new RuntimeException('MySQL 8.4 ou supérieur requis.');
    if ((int)$db->query('SELECT @@partial_revokes')->fetchColumn()!==0) throw new RuntimeException('Les droits de démonstration nécessitent partial_revokes=OFF ; consulter la configuration MySQL sans la modifier automatiquement.');
    $appUser=$name.'_app'; $account=$db->quote($appUser)."@'localhost'";
    $exists=$db->prepare("SELECT COUNT(*) FROM mysql.user WHERE User=? AND Host='localhost'");$exists->execute([$appUser]);
    if ($exists->fetchColumn()) throw new RuntimeException('Le compte applicatif existe déjà : aucune modification de ses droits ou de son mot de passe.');
    $sources=['driverman.sqlite'=>$name];
    foreach (glob($data.'/demo-*.sqlite') as $source) {
        if (preg_match('/^demo-([a-f0-9]{32})\.sqlite$/D',basename($source),$match)) $sources[basename($source)]=$name.'_demo_'.$match[1];
    }
    $existing=$db->query('SHOW DATABASES')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($sources as $destination) if (in_array($destination,$existing,true)) throw new RuntimeException('La destination '.$destination.' existe déjà : aucun écrasement.');

    $gate=fopen($data.'/database-migration.lock','c');
    $deadline=microtime(true)+35;
    while (!flock($gate,LOCK_EX|LOCK_NB)) {
        if (microtime(true)>$deadline) throw new RuntimeException('Des opérations sont encore en cours. Relancer la migration après leur fin.');
        usleep(100000);
    }
    $backupDir=$data.'/backups/mysql-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3));
    if (!mkdir($backupDir,0700,true)) throw new RuntimeException('Sauvegarde impossible.');
    $report=['database'=>$name,'created_at'=>gmdate(DATE_ATOM),'sources'=>[]];
    foreach ($sources as $file=>$destination) {
        sqliteBackup($data.'/'.$file,$backupDir.'/'.$file);
        $db->exec('CREATE DATABASE '.mysqlIdentifier($destination).' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
        $target=mysqlConnection($admin,$destination); createMysqlSchema($target);
        $tables=migrateSqliteData($backupDir.'/'.$file,$target);
        $report['sources'][$file]=['database'=>$destination,'tables'=>$tables];
        echo $file.' : '.array_sum(array_column($tables,'rows'))." lignes copiées et vérifiées.\n";
    }
    $config=['driver'=>'mysql','host'=>$admin['host'],'port'=>$admin['port'],'database'=>$name,'username'=>$appUser,
        'password'=>bin2hex(random_bytes(32)),'demo_prefix'=>$name.'_demo_'];
    $db->exec('CREATE USER '.$account.' IDENTIFIED BY '.$db->quote($config['password']));
    $grantName=str_replace('_','\\_',$name);
    $db->exec('GRANT SELECT,INSERT,UPDATE,DELETE ON `'.$grantName.'`.* TO '.$account);
    $db->exec('GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX,REFERENCES ON `'.$grantName.'\\_demo\\_%`.* TO '.$account);
    $probe=mysqlConnection($config,$name);
    if ((int)$probe->query('SELECT schema_version FROM app_write_lock WHERE id=1')->fetchColumn()!==1) throw new RuntimeException('Vérification du compte MySQL impossible.');
    // Validate demo privileges against an existing migrated demo without creating test data in production.
    foreach ($sources as $destination) if ($destination!==$name) mysqlConnection($config,$destination)->query('SELECT COUNT(*) FROM drivers')->fetchColumn();
    $pending=$data.'/database.json.pending';
    file_put_contents($pending,json_encode($config,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL,LOCK_EX);chmod($pending,0600);

    if (isset($options['deploy-to'])) {
        $root=realpath($options['deploy-to']);
        if (!$root || !is_file($root.'/api.php') || !is_file($root.'/app/bootstrap.php')) throw new RuntimeException('Destination du code DriverMan incorrecte.');
        $files=['app/database.php','app/mysql-schema.sql','app/bootstrap.php','app/notifications.php','app/tracking.php','app/push.php',
            'api.php','.htaccess','README.md','docs/notifications.md','docs/mysql.md','scripts/migrate-mysql.php','scripts/mysql-migration.php',
            'tests/mysql-fixture.php','tests/mysql-test-tools.php','tests/mysql-tests.mjs','tests/mysql-migration.php','tests/mysql-concurrency.php','tests/integration.mjs','tests/notifications.mjs','package.json'];
        foreach ($files as $file) if (!is_file(dirname(__DIR__).'/'.$file)) throw new RuntimeException('Fichier préparé manquant : '.$file);
        foreach ($files as $file) {
            $destination=$root.'/'.$file; $previous=$backupDir.'/application/'.$file;
            if (!is_dir(dirname($previous))) mkdir(dirname($previous),0700,true);
            if (is_file($destination) && !copy($destination,$previous)) throw new RuntimeException('Sauvegarde du code impossible.');
            if (!copy(dirname(__DIR__).'/'.$file,$destination.'.migrating') || !rename($destination.'.migrating',$destination)) throw new RuntimeException('Installation du code impossible : '.$file);
            $deployed[]=['destination'=>$destination,'previous'=>$previous];
        }
    }
    if (!rename($pending,$data.'/database.json')) throw new RuntimeException('Activation de la configuration impossible.');
    $activated=true;
    file_put_contents($backupDir.'/migration-report.json',json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL);
    echo "MySQL activé : $name. Les fichiers SQLite sont conservés mais ne sont plus utilisés.\nSauvegarde : $backupDir\n";
} catch (Throwable $error) {
    if (!$activated) foreach (array_reverse($deployed) as $file) {
        if (is_file($file['previous'])) copy($file['previous'],$file['destination']);
        else unlink($file['destination']);
    }
    // No data values, passwords, tokens or raw SQL are printed on failure.
    fwrite(STDERR,'Migration interrompue : '.($error instanceof PDOException ? 'erreur MySQL (code '.($error->errorInfo[1]??$error->getCode()).').' : $error->getMessage()).PHP_EOL);
    if (!$activated) fwrite(STDERR,"La configuration active reste inchangée. Les destinations créées sont conservées pour diagnostic.\n");
    exit(1);
} finally {
    if (is_resource($gate)) {flock($gate,LOCK_UN);fclose($gate);}
}
