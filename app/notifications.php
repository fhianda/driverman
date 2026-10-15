<?php
declare(strict_types=1);

function notificationPreferences(PDO $db, int $userId): array
{
    // Kept in the response for older clients. Events no longer need an opt-in.
    return ['departure'=>'both', 'fuel'=>'both'];
}

// Called inside the business transaction: failed or duplicate operations never alert.
function recordNotification(PDO $db, string $event, int $sourceId, string $title, string $body): void
{
    if (!empty($_SESSION['demo_id'])) return;
    $recipients=$db->query("SELECT id AS user_id FROM users WHERE role='admin'");
    foreach ($recipients->fetchAll() as $recipient) {
        $insert=$db->prepare('INSERT INTO notifications(user_id,event,source_id,title,body,created_at) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id');
        $insert->execute([$recipient['user_id'],$event,$sourceId,$title,$body,time()]);
        if (!$insert->rowCount()) continue;
        $id=(int)$db->lastInsertId();
        $db->prepare('INSERT INTO push_jobs(notification_id,device_id,next_at) SELECT ?,id,? FROM push_devices WHERE user_id=?')->execute([$id,time(),$recipient['user_id']]);
    }
}

function pushBinding(): string
{
    global $native, $tokenHash;
    return !empty($native) ? 'native:'.$tokenHash : 'web:'.hash('sha256',session_id());
}

function notificationStatus(PDO $db): array
{
    $id=(int)$_SESSION['user']['id'];
    $stmt=$db->prepare('SELECT id,event,title,body,created_at,read_at FROM notifications WHERE user_id=? AND created_at>=? ORDER BY id DESC LIMIT 50');
    $stmt->execute([$id,time()-90*86400]);
    $count=$db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL AND created_at>=?');$count->execute([$id,time()-90*86400]);
    $devices=$db->prepare('SELECT id,kind,updated_at FROM push_devices WHERE user_id=? AND binding=?');$devices->execute([$id,pushBinding()]);
    require_once __DIR__.'/push.php';
    return ['preferences'=>notificationPreferences($db,$id),'items'=>$stmt->fetchAll(),'unread'=>(int)$count->fetchColumn(),
        'devices'=>$devices->fetchAll(),'delivery'=>pushCapabilities(),'demo'=>!empty($_SESSION['demo_id'])];
}

function validatePushSubscription(array $input): array
{
    $kind=choice($input,'kind',['android','web']);
    if ($kind==='android') {
        $token=field($input,'token',4096);
        if (!preg_match('/^[A-Za-z0-9_:\-]{20,4096}$/D',$token)) fail('Identifiant de notification Android incorrect.');
        return [$kind,$token,json_encode(['token'=>$token],JSON_THROW_ON_ERROR)];
    }
    $sub=$input['subscription']??null;
    if (!is_array($sub) || !is_array($sub['keys']??null)) fail('Abonnement du navigateur incorrect.');
    $endpoint=field($sub,'endpoint',4096);$parts=parse_url($endpoint);
    // Explicit vendor allowlist prevents an authenticated client from turning push into SSRF.
    $host=strtolower($parts['host']??'');
    $allowed=in_array($host,['fcm.googleapis.com','updates.push.services.mozilla.com','updates-autopush.stage.mozaws.net','web.push.apple.com'],true) || str_ends_with($host,'.push.apple.com') || str_ends_with($host,'.notify.windows.com');
    if (!$allowed || ($parts['scheme']??'')!=='https' || isset($parts['port']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) fail('Service de notification du navigateur non reconnu.');
    foreach (['p256dh'=>65,'auth'=>16] as $key=>$length) {
        $value=$sub['keys'][$key]??'';
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9_\-]+={0,2}$/D',$value) || strlen((string)base64_decode(strtr($value,'-_','+/'),true))!==$length) fail('Clé de notification incorrecte.');
    }
    return [$kind,$endpoint,json_encode(['endpoint'=>$endpoint,'keys'=>['p256dh'=>$sub['keys']['p256dh'],'auth'=>$sub['keys']['auth']]],JSON_THROW_ON_ERROR)];
}

function notificationAction(PDO $db, string $action, array $input, bool $admin): never
{
    if (!$admin) fail('Ces notifications sont réservées aux administrateurs.',403);
    $userId=(int)$_SESSION['user']['id'];
    if ($action==='notifications') respond(notificationStatus($db));
    if ($action==='save-notification-preferences') {
        fail('Les alertes de départ et de carburant sont désormais automatiques. Actualisez DriverMan.',409);
    }
    if ($action==='read-notifications') {
        $through=integer($input,'through');
        $db->prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND id<=? AND read_at IS NULL')->execute([time(),$userId,$through]);
        respond(['success'=>true]);
    }
    if ($action==='subscribe-push') {
        if (!empty($_SESSION['demo_id'])) fail('Connectez-vous à votre compte pour activer les notifications sur cet appareil.');
        [$kind,$address,$subscription]=validatePushSubscription($input);
        require_once __DIR__.'/push.php';
        if (!pushCapabilities()[$kind]) fail('Les notifications à distance ne sont pas encore configurées pour cet appareil.',503);
        transaction($db,function() use($db,$kind,$address,$subscription,$userId) {
            $hash=hash('sha256',$kind.':'.$address);
            // Remove deliveries tied to a previous session/account before reassigning a device.
            $db->prepare('DELETE FROM push_jobs WHERE device_id IN (SELECT id FROM push_devices WHERE address_hash=? AND (user_id<>? OR binding<>?))')->execute([$hash,$userId,pushBinding()]);
            $db->prepare('INSERT INTO push_devices(user_id,kind,address_hash,subscription,binding,updated_at) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),subscription=VALUES(subscription),binding=VALUES(binding),updated_at=VALUES(updated_at)')->execute([$userId,$kind,$hash,$subscription,pushBinding(),time()]);
        });
        respond(['success'=>true]);
    }
    if ($action==='unsubscribe-push') {
        $db->prepare('DELETE FROM push_devices WHERE user_id=? AND binding=?')->execute([$userId,pushBinding()]);
        respond(['success'=>true]);
    }
    fail('Action de notification inconnue.',404);
}

function dispatchPushAfterResponse(PDO $db): void
{
    if (!empty($_SESSION['demo_id'])) return;
    register_shutdown_function(static function() use($db) {
        if (session_status()===PHP_SESSION_ACTIVE) session_write_close();
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        try { require_once __DIR__.'/push.php'; drainPushJobs($db,10); }
        catch (Throwable $error) { error_log('DriverMan: envoi des notifications en attente, consulter le worker.'); }
    });
}
