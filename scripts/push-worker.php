<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
define('DRIVERMAN_NATIVE_REQUEST',true);
require dirname(__DIR__).'/app/bootstrap.php';
require dirname(__DIR__).'/app/push.php';

if (in_array('--init',$argv,true)) {
    require dirname(__DIR__).'/vendor/autoload.php';
    $file=dataDir().DIRECTORY_SEPARATOR.'push.json';
    if (is_file($file)) { echo "Configuration existante conservée.\n"; exit; }
    $keys=Minishlink\WebPush\VAPID::createVapidKeys();
    $keys['subject']='https://driverman.trackkintrans.com/';
    $handle=fopen($file,'x');
    if (!$handle) throw new RuntimeException('Configuration déjà créée.');
    chmod($file,0600);
    fwrite($handle,json_encode(['vapid'=>$keys],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));fclose($handle);
    echo "Clés Web Push créées dans le répertoire privé de données. Sauvegardez ce fichier.\n";
    exit;
}
echo json_encode(drainPushJobs(database(true),100),JSON_THROW_ON_ERROR).PHP_EOL;
