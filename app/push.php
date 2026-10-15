<?php
declare(strict_types=1);

function pushSecrets(): array
{
    static $config;
    if (isset($config)) return $config;
    $path=dataDir().DIRECTORY_SEPARATOR.'push.json';
    $config=is_file($path) ? json_decode((string)file_get_contents($path),true) : [];
    return $config=is_array($config)?$config:[];
}

function pushCapabilities(): array
{
    static $cryptoReady=null;
    // Probe the same OpenSSL operation used by Web Push; missing server configuration
    // must never appear as working remote delivery in the interface.
    if ($cryptoReady===null) $cryptoReady=function_exists('openssl_pkey_new') && @openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1'])!==false;
    $config=pushSecrets();
    $web=$cryptoReady && is_file(dirname(__DIR__).'/vendor/autoload.php') && !empty($config['vapid']['publicKey']) && !empty($config['vapid']['privateKey']);
    $android=!empty($config['firebase']['project_id']) && !empty($config['firebase']['client_email']) && !empty($config['firebase']['private_key']);
    return ['web'=>$web,'android'=>$android,'publicKey'=>$web?$config['vapid']['publicKey']:null];
}

function notificationPayload(array $job): array
{
    return ['id'=>(string)$job['notification_id'],'title'=>$job['title'],'body'=>$job['body'],'mode'=>$job['mode'],
        'page'=>$job['event']==='fuel'?'fuel':'movements','tag'=>'driverman-'.$job['notification_id']];
}

function pushHttp(string $url, array $headers, string $body): array
{
    $curl=curl_init($url);
    curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_TIMEOUT=>8,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
    $response=curl_exec($curl);$code=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE);curl_close($curl);
    return [$code,is_string($response)?(json_decode($response,true)??[]):[]];
}

function firebaseAccessToken(array $credentials): string
{
    static $cached=null;
    if ($cached) return $cached;
    $b64=static fn(string $s):string=>rtrim(strtr(base64_encode($s),'+/','-_'),'=');
    $claims=['iss'=>$credentials['client_email'],'scope'=>'https://www.googleapis.com/auth/firebase.messaging','aud'=>'https://oauth2.googleapis.com/token','iat'=>time(),'exp'=>time()+3500];
    $jwt=$b64('{"alg":"RS256","typ":"JWT"}').'.'.$b64(json_encode($claims,JSON_THROW_ON_ERROR));
    if (!openssl_sign($jwt,$signature,$credentials['private_key'],OPENSSL_ALGO_SHA256)) throw new RuntimeException('firebase_key');
    [$code,$result]=pushHttp('https://oauth2.googleapis.com/token',['Content-Type: application/x-www-form-urlencoded'],http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$jwt.'.'.$b64($signature)]));
    if ($code!==200 || empty($result['access_token'])) throw new RuntimeException('firebase_auth');
    return $cached=$result['access_token'];
}

function sendPushJob(array $job): array
{
    $config=pushSecrets();$payload=notificationPayload($job);$sub=json_decode($job['subscription'],true,32,JSON_THROW_ON_ERROR);
    if ($job['kind']==='web') {
        require_once dirname(__DIR__).'/vendor/autoload.php';
        $sender=new Minishlink\WebPush\WebPush(['VAPID'=>$config['vapid']],['TTL'=>3600,'urgency'=>'high'],8,['allow_redirects'=>false,'connect_timeout'=>4]);
        $report=$sender->sendOneNotification(Minishlink\WebPush\Subscription::create($sub),json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        return ['success'=>$report->isSuccess(),'expired'=>$report->isSubscriptionExpired(),'error'=>'web_http_'.($report->getResponse()?->getStatusCode()??0)];
    }
    $credentials=$config['firebase'];
    if (!preg_match('/^[a-z][a-z0-9-]{4,62}$/D',$credentials['project_id'])) throw new RuntimeException('firebase_project');
    $mode=$job['mode'];
    // A notification payload is displayed by Android even without a running WebView.
    $notification=['channel_id'=>'driverman_'.$mode.'_v1','tag'=>$payload['tag'],'icon'=>'ic_stat_driverman',
        'default_vibrate_timings'=>in_array($mode,['vibrate','both'],true),'visibility'=>'PRIVATE'];
    if (in_array($mode,['sound','both'],true)) $notification['sound']='default';
    [$code,$result]=pushHttp('https://fcm.googleapis.com/v1/projects/'.$credentials['project_id'].'/messages:send',
        ['Content-Type: application/json','Authorization: Bearer '.firebaseAccessToken($credentials)],
        json_encode(['message'=>['token'=>$sub['token'],'notification'=>['title'=>$payload['title'],'body'=>$payload['body']],
            'data'=>$payload,'android'=>['priority'=>'HIGH','ttl'=>'3600s','notification'=>$notification]]],JSON_THROW_ON_ERROR));
    $expired=false;
    foreach (($result['error']['details']??[]) as $detail) if (($detail['errorCode']??'')==='UNREGISTERED') $expired=true;
    return ['success'=>$code===200,'expired'=>$expired,'error'=>'fcm_http_'.$code];
}

// The optional transport is injected by isolated tests, never from an HTTP parameter.
function drainPushJobs(PDO $db, int $limit=50, ?callable $transport=null): array
{
    $stats=['sent'=>0,'failed'=>0,'cancelled'=>0];
    $now=time();$deadline=microtime(true)+25;
    $db->prepare("DELETE FROM push_devices WHERE kind='android' AND binding LIKE 'native:%' AND NOT EXISTS (SELECT 1 FROM mobile_tokens t WHERE CONCAT('native:',t.token_hash)=push_devices.binding AND t.expires_at>?)")->execute([$now]);
    $db->prepare('DELETE FROM notifications WHERE created_at<?')->execute([$now-90*86400]);
    for ($i=0;$i<$limit && microtime(true)<$deadline;$i++) {
        $job=transaction($db,function() use($db) {
            $stmt=$db->prepare("SELECT j.*,n.user_id,n.event,n.title,n.body,n.created_at,d.kind,d.subscription,'both' mode,u.role,d.user_id device_owner FROM push_jobs j JOIN notifications n ON n.id=j.notification_id JOIN push_devices d ON d.id=j.device_id LEFT JOIN users u ON u.id=n.user_id WHERE j.state='pending' AND j.next_at<=? AND j.lease_until<=? ORDER BY j.id LIMIT 1");
            $stmt->execute([time(),time()]);$job=$stmt->fetch();
            if ($job) $db->prepare('UPDATE push_jobs SET lease_until=? WHERE id=?')->execute([time()+60,$job['id']]);
            return $job;
        });
        if (!$job) break;
        if ($job['role']!=='admin' || $job['mode']==='off' || $job['device_owner']!==$job['user_id'] || $job['created_at']<time()-3600) {
            $db->prepare("UPDATE push_jobs SET state='cancelled' WHERE id=?")->execute([$job['id']]);$stats['cancelled']++;continue;
        }
        try { $result=($transport??'sendPushJob')($job); }
        catch (Throwable $error) { $result=['success'=>false,'expired'=>false,'error'=>'transport_unavailable']; }
        if ($result['expired']) $db->prepare('DELETE FROM push_devices WHERE id=?')->execute([$job['device_id']]);
        $attempt=(int)$job['attempts']+1;
        $state=$result['success']?'sent':($attempt>=5?'failed':'pending');
        $db->prepare('UPDATE push_jobs SET state=?,attempts=?,next_at=?,lease_until=0,last_error=? WHERE id=?')->execute([$state,$attempt,time()+min(900,30*(2**($attempt-1))),$result['success']?null:$result['error'],$job['id']]);
        $stats[$result['success']?'sent':'failed']++;
    }
    return $stats;
}
