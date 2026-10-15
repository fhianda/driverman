<?php
declare(strict_types=1);

// Ordered for restoring into an empty workspace while keeping its administrators.
const RESET_TABLES = ['drivers','vehicles','users','movements','refuelings','resource_photos','movement_positions','movement_routes','notifications'];

function resetCounts(PDO $db): array
{
    $counts=[];
    foreach (RESET_TABLES as $table) {
        $counts[$table]=(int)$db->query('SELECT COUNT(*) FROM '.$table.($table==='users'?" WHERE role='driver'":''))->fetchColumn();
    }
    $counts['active']=(int)$db->query('SELECT COUNT(*) FROM movements WHERE end_at IS NULL')->fetchColumn();
    $counts['admins']=(int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
    return $counts;
}

function resetPassword(PDO $db, array $input): void
{
    $password=$input['password']??null;
    if (!is_string($password) || strlen($password)>72) fail('Saisissez votre mot de passe administrateur.');
    $key='reset:'.$_SESSION['user']['id'];
    $query=$db->prepare('SELECT attempts,reset_at FROM login_attempts WHERE address=?');
    $query->execute([$key]); $attempt=$query->fetch();
    if ($attempt && $attempt['reset_at']>time() && $attempt['attempts']>=8) fail('Trop de tentatives. Réessayez dans 15 minutes.',429);
    $query=$db->prepare("SELECT password FROM users WHERE id=? AND role='admin'");
    $query->execute([$_SESSION['user']['id']]);
    if (!password_verify($password,(string)$query->fetchColumn())) {
        $db->prepare('INSERT INTO login_attempts(address,attempts,reset_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=CASE WHEN reset_at < ? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at < ? THEN VALUES(reset_at) ELSE reset_at END')->execute([$key,time()+900,time(),time()]);
        fail('Mot de passe administrateur incorrect.');
    }
    $db->prepare('DELETE FROM login_attempts WHERE address=?')->execute([$key]);
}

function resetBackup(PDO $db): string
{
    $directory=dataDir().DIRECTORY_SEPARATOR.'reset-backups';
    if (!is_dir($directory) && !mkdir($directory,0700,true)) throw new RuntimeException('Sauvegarde indisponible.');
    $id=bin2hex(random_bytes(16)); $path=$directory.DIRECTORY_SEPARATOR.$id.'.sql';
    $file=fopen($path,'xb');
    if (!$file) throw new RuntimeException('Sauvegarde indisponible.');
    chmod($path,0600);
    $write=static function(string $text) use($file): void {
        if (fwrite($file,$text)!==strlen($text)) throw new RuntimeException('Sauvegarde incomplète.');
    };
    try {
        $write("-- DriverMan : sauvegarde avant nouvelle utilisation, ".date(DATE_ATOM)."\n-- Restaurer uniquement dans un espace vide, avec les administrateurs d'origine conservés.\n-- Les sessions et les envois de notifications ne sont pas restaurés.\nSET NAMES utf8mb4;\nSTART TRANSACTION;\n");
        foreach ([...RESET_TABLES,'app_settings'] as $table) {
            $query=$db->query('SELECT * FROM '.$table.($table==='users'?" WHERE role='driver'":($table==='app_settings'?" WHERE name LIKE 'driver_access:%'":'')));
            while ($row=$query->fetch(PDO::FETCH_ASSOC)) {
                // Invisible generated columns are excluded by SELECT * on MySQL/MariaDB.
                unset($row['active_driver_id'],$row['active_vehicle_id']);
                $columns=implode(',',array_map(static fn($key)=>'`'.$key.'`',array_keys($row)));
                // Hex literals preserve text, binary photos and SQL-mode-independent quoting.
                $values=[];
                foreach ($row as $column=>$value) {
                    $hex="X'".bin2hex((string)$value)."'";
                    $values[]=$value===null?'NULL':($table==='resource_photos' && $column==='content'?$hex:'CONVERT('.$hex.' USING utf8mb4)');
                }
                $values=implode(',',$values);
                $write('INSERT INTO `'.$table.'` ('.$columns.') VALUES ('.$values.");\n");
            }
        }
        $write("COMMIT;\n");
        if (!fflush($file)) throw new RuntimeException('Sauvegarde incomplète.');
    } finally {fclose($file);}
    return $id;
}

function resetAction(PDO $db, string $action, array $input, bool $admin): never
{
    if (!$admin || !empty($_SESSION['demo_id'])) fail('Cette action est réservée aux administrateurs de l’espace réel.',403);
    if ($action==='reset-preview') {
        $latest=$db->query("SELECT value FROM app_settings WHERE name='last_reset_backup'")->fetchColumn();
        respond(['counts'=>resetCounts($db),'backup_id'=>$latest?:null]);
    }
    if ($action==='reset-backup') {
        $id=field($input,'backup_id',32);
        if (!preg_match('/^[a-f0-9]{32}$/D',$id)) fail('Sauvegarde incorrecte.');
        $path=dataDir().DIRECTORY_SEPARATOR.'reset-backups'.DIRECTORY_SEPARATOR.$id.'.sql';
        if (!is_file($path)) fail('Sauvegarde introuvable.',404);
        respond(['filename'=>'DriverMan-sauvegarde-'.$id.'.sql','content'=>file_get_contents($path)]);
    }
    if (field($input,'confirmation',20)!=='REINITIALISER') fail('Saisissez REINITIALISER pour confirmer.');
    resetPassword($db,$input);
    $id=transaction($db,function() use($db) {
        if ($db->query('SELECT COUNT(*) FROM movements WHERE end_at IS NULL')->fetchColumn()) throw new DomainException('Enregistrez le retour de toutes les courses en cours avant la remise à zéro.');
        // A complete, private backup is mandatory before the first deletion.
        $id=resetBackup($db);
        foreach (['push_jobs','notifications','movement_positions','movement_routes','refuelings','movements','resource_photos'] as $table) $db->exec('DELETE FROM '.$table);
        foreach (['mobile_tokens','push_devices','notification_preferences'] as $table) $db->exec('DELETE FROM '.$table." WHERE user_id NOT IN (SELECT id FROM users WHERE role='admin')");
        $db->exec("DELETE FROM users WHERE role='driver'");
        $db->exec("DELETE FROM app_settings WHERE name LIKE 'driver_access:%'");
        $db->exec('DELETE FROM drivers'); $db->exec('DELETE FROM vehicles');
        // Do not recycle IDs: old offline queues must never attach to a new course.
        $db->prepare('INSERT INTO app_settings(name,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)')->execute(['last_reset_backup',$id]);
        return $id;
    });
    respond(['success'=>true,'backup_id'=>$id]);
}
