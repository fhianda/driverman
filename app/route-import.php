<?php
declare(strict_types=1);

// Les imports gardent leur provenance et les heures manquantes restent nulles.
function parseRouteFile(string $text): array
{
    if ($text === '' || strlen($text) > 2 * 1024 * 1024) throw new DomainException('Choisissez un fichier GPX, KML ou GeoJSON de 2 Mo maximum.');
    $segments = [];
    $count = 0;
    $point = function (mixed $lat, mixed $lon, mixed $time = null) use (&$count): array {
        if (++$count > 20000) throw new DomainException('Le fichier dépasse 20 000 points. Exportez une course à la fois.');
        if (!is_numeric($lat) || !is_numeric($lon) || !is_finite((float)$lat) || !is_finite((float)$lon) || abs((float)$lat) > 90 || abs((float)$lon) > 180) throw new DomainException('Coordonnées invalides. Exportez en WGS84 (latitude / longitude), pas en mètres UTM.');
        $at = null;
        if ($time !== null && $time !== '') {
            if (!is_string($time) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $time)) throw new DomainException('Une heure GPS est invalide ou ne précise pas son fuseau horaire.');
            try { $date = new DateTimeImmutable($time); } catch (Exception) { throw new DomainException('Heure GPS invalide.'); }
            $errors = DateTimeImmutable::getLastErrors();
            if ($errors && ($errors['warning_count'] || $errors['error_count'])) throw new DomainException('Heure GPS invalide.');
            $at = (int)round((float)$date->format('U.u') * 1000);
        }
        return ['latitude'=>(float)$lat, 'longitude'=>(float)$lon, 'recorded_at'=>$at];
    };
    $text = ltrim($text, "\xEF\xBB\xBF \t\r\n");
    if (str_starts_with($text, '{')) {
        try { $data = json_decode($text, true, 32, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new DomainException('Le GeoJSON est illisible.'); }
        $walk = function (mixed $item, int $depth = 0) use (&$walk, &$segments, $point): void {
            if (!is_array($item) || $depth > 6) throw new DomainException('Structure GeoJSON non prise en charge.');
            if (isset($item['crs']) && !in_array($item['crs']['properties']['name'] ?? '', ['EPSG:4326','urn:ogc:def:crs:OGC:1.3:CRS84','urn:ogc:def:crs:EPSG::4326'], true)) throw new DomainException('Exportez le tracé en WGS84, pas en mètres UTM.');
            $type = $item['type'] ?? '';
            if ($type === 'FeatureCollection' && is_array($item['features'] ?? null)) { foreach ($item['features'] as $feature) $walk($feature, $depth+1); }
            elseif ($type === 'Feature') $walk($item['geometry'] ?? null, $depth+1);
            elseif (in_array($type, ['LineString','MultiLineString'], true) && is_array($item['coordinates'] ?? null)) {
                $lines = $type === 'LineString' ? [$item['coordinates']] : $item['coordinates'];
                foreach ($lines as $line) {
                    if (!is_array($line)) throw new DomainException('Ligne GeoJSON invalide.');
                    $part = [];
                    foreach ($line as $coord) {
                        if (!is_array($coord) || count($coord)<2) throw new DomainException('Coordonnée GeoJSON invalide.');
                        $part[] = $point($coord[1], $coord[0]);
                    }
                    if ($part) $segments[] = $part;
                }
            } else throw new DomainException('Exportez seulement les lignes de cette course (LineString ou MultiLineString).');
        };
        $walk($data);
        $format = 'GeoJSON';
    } else {
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $text)) throw new DomainException('Les déclarations DTD et entités XML ne sont pas acceptées.');
        $previous = libxml_use_internal_errors(true);
        try {
            $xml = new DOMDocument();
            if (!$xml->loadXML($text, LIBXML_NONET | LIBXML_NOBLANKS)) throw new DomainException('Le fichier GPX ou KML est illisible.');
            $xpath = new DOMXPath($xml);
            $root = $xml->documentElement->localName;
            if ($root === 'gpx') {
                $format = 'GPX';
                foreach ($xpath->query('/*[local-name()="gpx"]/*[local-name()="trk"]/*[local-name()="trkseg"] | /*[local-name()="gpx"]/*[local-name()="rte"]') as $line) {
                    $part = [];
                    foreach ($line->childNodes as $node) {
                        if (!$node instanceof DOMElement || !in_array($node->localName, ['trkpt','rtept'], true)) continue;
                        $time = $xpath->evaluate('string(./*[local-name()="time"])', $node);
                        $part[] = $point($node->getAttribute('lat'), $node->getAttribute('lon'), $time);
                    }
                    if ($part) $segments[] = $part;
                }
            } elseif ($root === 'kml') {
                $format = 'KML';
                if ($xpath->query('//*[local-name()="Polygon"]')->length) throw new DomainException('Exportez une ligne d’itinéraire, pas un polygone.');
                foreach ($xpath->query('//*[local-name()="LineString"] | //*[local-name()="Track"] | //*[local-name()="Point"]') as $line) {
                    $part = [];
                    if ($line->localName === 'Track') {
                        $times = $xpath->query('./*[local-name()="when"]', $line);
                        $coords = $xpath->query('./*[local-name()="coord"]', $line);
                        if ($times->length !== $coords->length) throw new DomainException('Les positions et heures du tracé KML ne correspondent pas.');
                        foreach ($coords as $i=>$coord) {
                            $values = preg_split('/\s+/', trim($coord->textContent));
                            $part[] = $point($values[1] ?? null, $values[0] ?? null, trim($times->item($i)->textContent));
                        }
                    } else {
                        $coordinates = trim($xpath->evaluate('string(./*[local-name()="coordinates"])', $line));
                        foreach ($coordinates === '' ? [] : preg_split('/\s+/', $coordinates) as $coord) {
                            $values = explode(',', $coord);
                            $part[] = $point($values[1] ?? null, $values[0] ?? null);
                        }
                    }
                    if ($part) $segments[] = $part;
                }
            } else throw new DomainException('Choisissez un export GPX, KML ou GeoJSON.');
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }
    if (!$count) throw new DomainException('Aucune ligne trouvée. Exportez le tracé de la course, pas seulement des repères isolés.');
    return ['format'=>$format, 'segments'=>$segments, 'point_count'=>$count];
}

function importRouteAction(PDO $db, string $action, array $input, bool $admin): never
{
    $movementId = integer($input, 'movement_id');
    $movement = row($db, 'movements', $movementId);
    if (!$admin && (int)$movement['driver_id'] !== (int)$_SESSION['user']['driver_id']) fail('Cette trajectoire ne vous appartient pas.', 403);
    if (!empty($_SESSION['demo_id'])) fail('Importez les données GPS dans votre espace réel.', 403);
    $text = $input['content'] ?? null;
    if (!is_string($text)) fail('Fichier manquant.');
    $name = field($input, 'name', 150);
    $route = parseRouteFile($text);
    $validateTimes = function (array $trip) use ($route): void {
        $from = (new DateTimeImmutable($trip['start_at']))->getTimestamp()*1000;
        $to = $trip['end_at'] ? (new DateTimeImmutable($trip['end_at']))->getTimestamp()*1000+59999 : (int)floor(microtime(true)*1000)+60000;
        foreach ($route['segments'] as $part) foreach ($part as $point) {
            $at = $point['recorded_at'];
            if ($at !== null && ($at < $from || $at > $to || $at > (int)floor(microtime(true)*1000)+60000)) throw new DomainException('Le fichier contient des positions datées hors de cette course. Exportez uniquement la portion correspondante.');
        }
    };
    $validateTimes($movement);
    if ($action === 'preview-route') respond(['route'=>['name'=>$name]+$route]);
    $result = transaction($db, function () use ($db, $movementId, $text, $name, $route, $validateTimes) {
        $validateTimes(row($db, 'movements', $movementId));
        $hash = hash('sha256', $text);
        $statement = $db->prepare('SELECT id FROM movement_routes WHERE movement_id=? AND file_hash=?');
        $statement->execute([$movementId,$hash]);
        if ($id = $statement->fetchColumn()) return ['id'=>(int)$id, 'duplicate'=>true];
        $statement = $db->prepare('SELECT COUNT(*) AS files,COALESCE(SUM(point_count),0) AS points FROM movement_routes WHERE movement_id=?');
        $statement->execute([$movementId]);
        $usage = $statement->fetch();
        if ($usage['files'] >= 20 || $usage['points']+$route['point_count'] > 100000) throw new DomainException('Limite d’imports atteinte pour cette course (20 fichiers ou 100 000 points).');
        $db->prepare('INSERT INTO movement_routes(movement_id,file_hash,name,format,segments_json,point_count,created_by) VALUES(?,?,?,?,?,?,?)')->execute([$movementId,$hash,$name,$route['format'],json_encode($route['segments'],JSON_THROW_ON_ERROR),$route['point_count'],$_SESSION['user']['id']]);
        return ['id'=>(int)$db->lastInsertId(),'duplicate'=>false];
    });
    respond($result);
}
