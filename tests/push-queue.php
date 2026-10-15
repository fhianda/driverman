<?php
declare(strict_types=1);
define('DRIVERMAN_NATIVE_REQUEST',true);
require __DIR__.'/../app/bootstrap.php';
require __DIR__.'/../app/notifications.php';
require __DIR__.'/../app/push.php';
function check(bool $value,string $label):void { if (!$value) throw new RuntimeException($label); }
try {
    $db=database();$_SESSION['user']=['id'=>1,'role'=>'admin'];
    $db->exec('DELETE FROM push_devices; DELETE FROM notifications;');
    $db->prepare("INSERT INTO push_devices(user_id,kind,address_hash,subscription,binding,updated_at) VALUES(1,'web','test','{}','web:test',?)")->execute([time()]);
    transaction($db,fn()=>recordNotification($db,'departure',100,'Départ','Test'));
    transaction($db,fn()=>recordNotification($db,'departure',100,'Départ','Test'));
    check((int)$db->query('SELECT COUNT(*) FROM push_jobs')->fetchColumn()===1,'Outbox sans doublon');
    try {transaction($db,function()use($db){recordNotification($db,'departure',101,'Départ','Test');throw new DomainException('rollback');});}catch(DomainException){}
    check((int)$db->query('SELECT COUNT(*) FROM push_jobs')->fetchColumn()===1,'Rollback du métier et de l’alerte');
    $failed=fn($job)=>['success'=>false,'expired'=>false,'error'=>'test'];
    drainPushJobs($db,5,$failed);
    check((int)$db->query('SELECT attempts FROM push_jobs')->fetchColumn()===1,'Tentative comptée');
    $called=0;$success=function($job)use(&$called){$called++;check($job['mode']==='both','Mode courant');return ['success'=>true,'expired'=>false,'error'=>''];};
    drainPushJobs($db,5,$success);check($called===0,'Backoff respecté');
    $db->exec('UPDATE push_jobs SET next_at=0');drainPushJobs($db,5,$success);drainPushJobs($db,5,$success);check($called===1,'Envoi non répété après succès');
    transaction($db,fn()=>recordNotification($db,'departure',102,'Départ','Test'));
    $db->exec("INSERT INTO notification_preferences(user_id,event,mode) VALUES(1,'departure','off') ON DUPLICATE KEY UPDATE mode='off'");
    drainPushJobs($db,5,$success);check($called===2,'Une ancienne préférence off ne bloque plus les alertes automatiques');
    $db->exec("UPDATE notification_preferences SET mode='both' WHERE user_id=1 AND event='departure'");
    transaction($db,fn()=>recordNotification($db,'departure',103,'Départ','Test'));
    $db->exec("UPDATE notifications SET created_at=0 WHERE source_id=103");drainPushJobs($db,5,$success);check($called===2,'Pas d’alerte ancienne');
    transaction($db,fn()=>recordNotification($db,'departure',104,'Départ','Test'));
    $db->exec('UPDATE push_devices SET user_id=2');drainPushJobs($db,5,$success);check($called===2,'Changement de propriétaire respecté');
    $db->exec('UPDATE push_devices SET user_id=1');
    transaction($db,fn()=>recordNotification($db,'departure',105,'Départ','Test'));
    drainPushJobs($db,5,fn($job)=>['success'=>false,'expired'=>true,'error'=>'expired']);
    check((int)$db->query('SELECT COUNT(*) FROM push_devices')->fetchColumn()===0,'Abonnement expiré retiré');
    $db->prepare("INSERT INTO push_devices(user_id,kind,address_hash,subscription,binding,updated_at) VALUES(1,'web','retry','{}','web:test',?)")->execute([time()]);
    transaction($db,fn()=>recordNotification($db,'departure',106,'Départ','Test'));
    for ($i=0;$i<6;$i++) {$db->exec('UPDATE push_jobs SET next_at=0');drainPushJobs($db,5,$failed);}
    $retry=$db->query("SELECT attempts,state FROM push_jobs j JOIN notifications n ON n.id=j.notification_id WHERE n.source_id=106")->fetch();
    check($retry['attempts']===5 && $retry['state']==='failed','Arrêt après cinq échecs');
    require __DIR__.'/../vendor/autoload.php';
    $keys=Minishlink\WebPush\VAPID::createVapidKeys();
    $handler=new GuzzleHttp\Handler\MockHandler([new GuzzleHttp\Psr7\Response(201)]);
    $sender=new Minishlink\WebPush\WebPush(['VAPID'=>pushSecrets()['vapid']],[],3,['handler'=>$handler]);
    $sub=Minishlink\WebPush\Subscription::create(['endpoint'=>'https://web.push.apple.com/test','keys'=>['p256dh'=>$keys['publicKey'],'auth'=>rtrim(strtr(base64_encode(random_bytes(16)),'+/','-_'),'=')]]);
    check($sender->sendOneNotification($sub,'{"title":"Test"}')->isSuccess(),'Chiffrement Web Push réel, transport simulé');
    echo "File d’envoi automatique, isolation et chiffrement Web Push vérifiés.\n";
} catch(Throwable $e) {fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
