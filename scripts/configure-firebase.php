<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
define('DRIVERMAN_NATIVE_REQUEST',true);
require dirname(__DIR__).'/app/bootstrap.php';
try {
    $source=$argv[1]??'';
    if (!$source || !is_file($source)) throw new RuntimeException('Indiquez le chemin du fichier JSON du compte de service Firebase.');
    $credentials=json_decode((string)file_get_contents($source),true,16,JSON_THROW_ON_ERROR);
    if (($credentials['type']??'')!=='service_account' || !preg_match('/^[a-z][a-z0-9-]{4,62}$/D',$credentials['project_id']??'') || !filter_var($credentials['client_email']??'',FILTER_VALIDATE_EMAIL) || !openssl_pkey_get_private($credentials['private_key']??'')) throw new RuntimeException('Fichier de compte de service invalide.');
    $file=dataDir().DIRECTORY_SEPARATOR.'push.json';
    if (!is_file($file)) throw new RuntimeException('Initialisez d’abord Web Push avec scripts/push-worker.php --init.');
    $config=json_decode((string)file_get_contents($file),true,16,JSON_THROW_ON_ERROR);
    $config['firebase']=array_intersect_key($credentials,array_flip(['project_id','client_email','private_key']));
    $temp=$file.'.'.bin2hex(random_bytes(8)).'.tmp';
    file_put_contents($temp,json_encode($config,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);chmod($temp,0600);
    if (!rename($temp,$file)) throw new RuntimeException('Impossible d’enregistrer la configuration privée.');
    echo "Configuration Firebase enregistrée dans le répertoire privé. Aucun secret n’est inclus dans l’APK.\n";
} catch (Throwable $error) { fwrite(STDERR,'Configuration non enregistrée : '.$error->getMessage().PHP_EOL); exit(1); }
