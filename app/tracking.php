<?php
declare(strict_types=1);

function trackingAction(PDO $db, string $action, array $input, bool $admin): never
{
    $movementId = integer($action === 'route' ? $_GET : $input, 'movement_id');
    $movement = row($db, 'movements', $movementId);
    if (!$admin && (int)$movement['driver_id'] !== (int)$_SESSION['user']['driver_id']) fail('Cette trajectoire ne vous appartient pas.', 403);
    if ($action === 'route') {
        $statement = $db->prepare('SELECT sample_id,segment_id,recorded_at,latitude,longitude,accuracy FROM movement_positions WHERE movement_id=? ORDER BY recorded_at,id');
        $statement->execute([$movementId]);
        $points = $statement->fetchAll();
        $statement = $db->prepare('SELECT id,name,format,segments_json,point_count,created_at FROM movement_routes WHERE movement_id=? ORDER BY id');
        $statement->execute([$movementId]);
        $imports = $statement->fetchAll();
        foreach ($imports as &$route) {
            $route['segments'] = json_decode($route['segments_json'], true, 32, JSON_THROW_ON_ERROR);
            unset($route['segments_json']);
        }
        respond(['movement_id'=>$movementId,'points'=>$points,'imports'=>$imports]);
    }
    if ($admin || !empty($_SESSION['demo_id'])) fail('Le relevé GPS est réservé au chauffeur de la course hors démonstration.', 403);
    $points = $input['points'] ?? null;
    if (!is_array($points) || !array_is_list($points) || count($points) < 1 || count($points) > 200) fail('Envoyez entre 1 et 200 positions.');
    $result = transaction($db, function () use ($db, $movementId, $points) {
        // Relire le retour dans la transaction pour les envois simultanés.
        $movement = row($db, 'movements', $movementId);
        $from = (new DateTimeImmutable($movement['start_at']))->getTimestamp()*1000;
        $to = $movement['end_at'] ? (new DateTimeImmutable($movement['end_at']))->getTimestamp()*1000+59999 : (int)floor(microtime(true)*1000)+60000;
        $count = $db->prepare('SELECT COUNT(*) FROM movement_positions WHERE movement_id=?');
        $count->execute([$movementId]);
        $total = (int)$count->fetchColumn();
        $save = $db->prepare('INSERT INTO movement_positions(movement_id,sample_id,segment_id,recorded_at,latitude,longitude,accuracy,created_by) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id');
        $accepted=[];$discarded=[];
        foreach ($points as $point) {
            if (!is_array($point)) throw new DomainException('Position incorrecte.');
            $id = field($point,'sample_id',36);
            $segment = field($point,'segment_id',36);
            if (!preg_match('/^[a-f0-9-]{36}$/D',$id) || !preg_match('/^[a-f0-9-]{36}$/D',$segment)) throw new DomainException('Identifiant de position incorrect.');
            $at = $point['recorded_at'] ?? null;
            $lat = $point['latitude'] ?? null; $lon = $point['longitude'] ?? null; $accuracy = $point['accuracy'] ?? null;
            if (!is_int($at) || !is_numeric($lat) || !is_numeric($lon) || !is_numeric($accuracy) || !is_finite((float)$lat) || !is_finite((float)$lon) || !is_finite((float)$accuracy) || abs((float)$lat)>90 || abs((float)$lon)>180 || $accuracy<=0 || $accuracy>50) throw new DomainException('Position ou précision GPS invalide.');
            if ($at<$from || $at>$to || $at>(int)floor(microtime(true)*1000)+60000) { $discarded[]=$id; continue; }
            $save->execute([$movementId,$id,$segment,$at,$lat,$lon,$accuracy,$_SESSION['user']['id']]);
            $total += $save->rowCount();
            if ($total > 100000) throw new DomainException('Limite de 100 000 points atteinte pour cette course.');
            $accepted[]=$id;
        }
        return ['accepted'=>$accepted,'discarded'=>$discarded,'ended'=>(bool)$movement['end_at']];
    });
    respond($result);
}
