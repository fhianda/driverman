<?php
declare(strict_types=1);

// Install this launcher outside public_html. The cron sets the two paths.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
chmod(__DIR__, 0700);
$appDir = rtrim((string)getenv('DRIVERMAN_APP_DIR'), '/');
$dataDir = rtrim((string)getenv('DRIVERMAN_DATA_DIR'), '/');
if (!$appDir || !$dataDir || !is_file($appDir.'/app/bootstrap.php') || !is_file($dataDir.'/database.json')) {
    fwrite(STDERR, "Chemins DriverMan non configurés.\n"); exit(1);
}
$lock = fopen(__DIR__.'/.push-worker.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit;
define('DRIVERMAN_NATIVE_REQUEST', true);
require $appDir.'/app/bootstrap.php';
require $appDir.'/app/push.php';
$status = ['checked_at'=>gmdate('c'), 'web'=>false, 'android'=>false, 'firebase_validated'=>false];
try {
    $configFile = $dataDir.'/push.json';
    $config = is_file($configFile) ? json_decode((string)file_get_contents($configFile), true, 32, JSON_THROW_ON_ERROR) : [];
    $changed = false;
    if (empty($config['vapid']['publicKey']) || empty($config['vapid']['privateKey'])) {
        require_once $appDir.'/vendor/autoload.php';
        $config['vapid'] = Minishlink\WebPush\VAPID::createVapidKeys();
        $config['vapid']['subject'] = 'https://driverman.trackkintrans.com/';
        $changed = true;
    }
    $keyFile = __DIR__.'/driverman-notifications-service-account.json';
    if (is_file($keyFile)) {
        $credentials = json_decode((string)file_get_contents($keyFile), true, 16, JSON_THROW_ON_ERROR);
        if (($credentials['type']??'') !== 'service_account'
            || ($credentials['project_id']??'') !== 'driverman-d5cbd'
            || ($credentials['client_email']??'') !== 'driverman-notifications@driverman-d5cbd.iam.gserviceaccount.com'
            || !openssl_pkey_get_private($credentials['private_key']??'')) {
            throw new RuntimeException('firebase_configuration_invalid');
        }
        $config['firebase'] = array_intersect_key($credentials, array_flip(['project_id','client_email','private_key']));
        $changed = true;
    }
    if ($changed) {
        $temporary = $configFile.'.'.bin2hex(random_bytes(8)).'.tmp';
        if (file_put_contents($temporary, json_encode($config, JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT), LOCK_EX) === false) throw new RuntimeException('private_config_write_failed');
        chmod($temporary, 0600);
        if (!rename($temporary, $configFile)) throw new RuntimeException('private_config_install_failed');
        if (is_file($keyFile)) unlink($keyFile);
    }
    $capabilities = pushCapabilities();
    $status['web'] = $capabilities['web'];
    $status['android'] = $capabilities['android'];
    if (!$status['android']) throw new RuntimeException('waiting_for_firebase_configuration');
    $fingerprint = hash('sha256', $config['firebase']['private_key']);
    $verifiedFile = __DIR__.'/.firebase-verified';
    if (!is_file($verifiedFile) || trim((string)file_get_contents($verifiedFile)) !== $fingerprint) {
        [$code] = pushHttp('https://fcm.googleapis.com/v1/projects/driverman-d5cbd/messages:send',
            ['Content-Type: application/json', 'Authorization: Bearer '.firebaseAccessToken($config['firebase'])],
            json_encode(['validate_only'=>true, 'message'=>['topic'=>'driverman-configuration-check',
                'notification'=>['title'=>'DriverMan','body'=>'Validation de la configuration'],
                'android'=>['priority'=>'HIGH','notification'=>['channel_id'=>'driverman_both_v1','icon'=>'ic_stat_driverman']]]], JSON_THROW_ON_ERROR));
        if ($code !== 200) throw new RuntimeException('firebase_validation_http_'.$code);
        file_put_contents($verifiedFile, $fingerprint, LOCK_EX);
        chmod($verifiedFile, 0600);
    }
    $status['firebase_validated'] = true;
    $status['queue'] = drainPushJobs(database(true), 100);
} catch (Throwable $error) {
    // Never expose provider responses, credentials or database details in cron logs.
    $message = $error->getMessage();
    $status['error'] = preg_match('/^(?:firebase_[a-z_0-9]+|private_config_[a-z_]+|waiting_for_firebase_configuration)$/D', $message) ? $message : 'notification_worker_error';
}
$summary = json_encode($status, JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
file_put_contents(__DIR__.'/status.json', $summary."\n", LOCK_EX);
echo $summary."\n";
exit(isset($status['error']) ? 1 : 0);
