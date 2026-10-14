<?php
declare(strict_types=1);

date_default_timezone_set(getenv('DRIVERMAN_TIMEZONE') ?: 'Africa/Lagos');
ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');
session_name('driverman_session');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/',
]);
if (!defined('DRIVERMAN_NATIVE_REQUEST')) session_start();
else $_SESSION = [];
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));

function regenerateSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
}

function dataDir(): string
{
    $path = getenv('DRIVERMAN_DATA_DIR') ?: dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'driverman-data';
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Impossible de créer le répertoire de données.');
    }
    return $path;
}

require_once __DIR__.'/database.php';

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function fail(string $message, int $status = 422): never
{
    respond(['error' => $message], $status);
}

function field(array $input, string $key, int $max = 150, bool $required = true): string
{
    if (isset($input[$key]) && !is_scalar($input[$key])) fail('Un champ contient une valeur incorrecte.');
    $value = trim((string)($input[$key] ?? ''));
    if ($required && $value === '') fail('Veuillez remplir tous les champs obligatoires.');
    if (mb_strlen($value) > $max) fail('Un champ dépasse la longueur autorisée (' . $max . ' caractères).');
    return $value;
}

function integer(array $input, string $key): int
{
    $value = filter_var($input[$key] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 10000000]]);
    if ($value === false || $value === null) fail('Veuillez saisir un kilométrage ou un identifiant valide.');
    return $value;
}

function choice(array $input, string $key, array $values): string
{
    $value = field($input, $key);
    if (!in_array($value, $values, true)) fail('La valeur sélectionnée est incorrecte.');
    return $value;
}

function thousandths(array $input, string $key, int $maximum, bool $positive = false): int
{
    $value = field($input, $key, 20);
    if (!preg_match('/^\d+(?:\.\d{1,3})?$/D', $value) || (float)$value > $maximum) fail('Saisissez une quantité ou un prix valide, avec trois décimales maximum.');
    [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
    $result = (int)$whole * 1000 + (int)str_pad($fraction, 3, '0');
    if ($positive && $result === 0) fail('Le nombre de litres doit être supérieur à zéro.');
    return $result;
}

function coordinate(array $input, string $key, float $minimum, float $maximum): ?float
{
    $value = field($input, $key, 30, false);
    if ($value === '') return null;
    if (!is_numeric($value) || !is_finite((float)$value) || (float)$value < $minimum || (float)$value > $maximum) fail('Coordonnées géographiques invalides.');
    return (float)$value;
}

function moment(array $input, string $key, bool $dateOnly = false): string
{
    $value = field($input, $key, 20);
    $format = $dateOnly ? 'Y-m-d' : 'Y-m-d\TH:i';
    $date = DateTimeImmutable::createFromFormat('!' . $format, $value);
    if (!$date || $date->format($format) !== $value) fail('Veuillez renseigner une date valide.');
    return $date->format($dateOnly ? 'Y-m-d' : 'Y-m-d H:i:s');
}

function row(PDO $db, string $table, int $id): array
{
    if (!in_array($table, ['drivers', 'vehicles', 'movements'], true)) throw new LogicException('Table inconnue.');
    $statement = $db->prepare("SELECT * FROM $table WHERE id = ?" . ($table === 'movements' ? '' : ' AND deleted_at IS NULL'));
    $statement->execute([$id]);
    return $statement->fetch() ?: throw new DomainException('Cet enregistrement n’existe plus.');
}

function activeFor(PDO $db, string $column, int $id): bool
{
    if (!in_array($column, ['driver_id', 'vehicle_id'], true)) throw new LogicException('Colonne inconnue.');
    $statement = $db->prepare("SELECT 1 FROM movements WHERE $column = ? AND end_at IS NULL");
    $statement->execute([$id]);
    return (bool)$statement->fetchColumn();
}

function transaction(PDO $db, callable $fn): mixed
{
    $db->beginTransaction();
    try {
        // Serialize business checks as SQLite previously did, now using an InnoDB row lock.
        $db->query('SELECT id FROM app_write_lock WHERE id=1 FOR UPDATE')->fetchColumn();
        $result = $fn();
        $db->commit();
        return $result;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

// Les images restent dans la même base privée que les fiches, y compris en démonstration.
function uploadedPhoto(string $type): ?string
{
    $file = $_FILES['photo'] ?? null;
    if ($file === null) return null;
    if (!is_array($file) || !isset($file['error']) || !is_int($file['error'])) fail('Fichier photo incorrect.');
    if ($file['error'] === UPLOAD_ERR_NO_FILE) return null;
    if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) fail('La photo ne doit pas dépasser 2 Mo.');
    if ($file['error'] !== UPLOAD_ERR_OK) fail('La photo n’a pas été transférée. Veuillez réessayer.');
    if (!is_uploaded_file($file['tmp_name']) || $file['size'] > 2 * 1024 * 1024) fail('La photo ne doit pas dépasser 2 Mo.');
    $bytes = file_get_contents($file['tmp_name']);
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) fail('Choisissez une photo JPG, PNG ou WebP valide.');
    if ($info[0] > 6000 || $info[1] > 6000 || $info[0] * $info[1] > 12000000) fail('La photo est trop grande. Réduisez-la à 12 mégapixels et 6 000 pixels par côté maximum.');
    if (!function_exists('imagecreatefromstring')) throw new RuntimeException('L’extension PHP GD est nécessaire pour les photos.');
    $source = @imagecreatefromstring($bytes);
    if (!$source) fail('Cette photo est endommagée ou illisible.');
    // Orientation des photos de téléphone avant le redimensionnement.
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($file['tmp_name']);
        $orientation = (int)($exif['Orientation'] ?? 1);
        if (in_array($orientation, [2, 5, 7], true)) imageflip($source, IMG_FLIP_HORIZONTAL);
        if ($orientation === 4) imageflip($source, IMG_FLIP_VERTICAL);
        $angle = match ($orientation) {3 => 180, 5, 8 => 90, 6, 7 => -90, default => 0};
        if ($angle) $source = imagerotate($source, $angle, 0);
    }
    $width = imagesx($source);
    $height = imagesy($source);
    $scale = min(1, ($type === 'driver' ? 512 : 1600) / max($width, $height));
    $target = imagecreatetruecolor(max(1, (int)round($width * $scale)), max(1, (int)round($height * $scale)));
    imagefill($target, 0, 0, imagecolorallocate($target, 238, 242, 246));
    imagecopyresampled($target, $source, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height);
    ob_start();
    imagejpeg($target, null, 85);
    $photo = ob_get_clean();
    imagedestroy($source);
    imagedestroy($target);
    return $photo;
}

function savePhoto(PDO $db, string $type, int $id, ?string $photo, bool $remove): void
{
    if ($photo !== null) {
        $statement = $db->prepare('INSERT INTO resource_photos(resource_type,resource_id,version,content) VALUES(?,?,?,?) AS incoming ON DUPLICATE KEY UPDATE version=incoming.version,content=incoming.content');
        $statement->bindValue(1, $type);
        $statement->bindValue(2, $id, PDO::PARAM_INT);
        $statement->bindValue(3, bin2hex(random_bytes(12)));
        $statement->bindValue(4, $photo, PDO::PARAM_LOB);
        $statement->execute();
    } elseif ($remove) {
        $db->prepare('DELETE FROM resource_photos WHERE resource_type=? AND resource_id=?')->execute([$type, $id]);
    }
}

function withPhotos(PDO $db, array $records, string $type): array
{
    $statement = $db->prepare('SELECT version FROM resource_photos WHERE resource_type=? AND resource_id=?');
    foreach ($records as &$record) {
        $statement->execute([$type, $record['id']]);
        $version = $statement->fetchColumn();
        $record['photo_url'] = $version ? 'api.php?action=photo&type=' . $type . '&id=' . $record['id'] . '&v=' . $version : null;
    }
    return $records;
}

function seedDemo(PDO $db): void
{
    $future = date('Y-m-d', strtotime('+2 years'));
    $drivers = [
        ['Patrick Ilunga', '+243 81 234 5678', 'PC-2024-001', $future, 'available'],
        ['Grâce Kabeya', '+243 82 456 7890', 'PC-2024-002', $future, 'available'],
        ['Jean Mutombo', '+243 89 123 4567', 'PC-2024-003', $future, 'available'],
        ['David Kasongo', '+243 81 987 6543', 'PC-2024-004', $future, 'available'],
        ['Sarah Mukendi', '+243 84 567 8901', 'PC-2024-005', date('Y-m-d', strtotime('+20 days')), 'available'],
        ['Alain Mbuyi', '+243 85 432 1098', 'PC-2024-006', $future, 'offline'],
    ];
    $stmt = $db->prepare('INSERT INTO drivers(name,phone,license,license_expiry,status) VALUES(?,?,?,?,?)');
    foreach ($drivers as $driver) $stmt->execute($driver);
    $vehicles = [
        ['KN 4821 AB', 'Toyota', 'Land Cruiser', 'SUV', 'Diesel', 28450, 'available'],
        ['KN 7356 CD', 'Toyota', 'Hilux', 'Pick-up', 'Diesel', 42180, 'available'],
        ['KN 2190 EF', 'Hyundai', 'Tucson', 'SUV', 'Essence', 15620, 'available'],
        ['KN 9042 GH', 'Toyota', 'Hiace', 'Minibus', 'Diesel', 63890, 'available'],
        ['KN 5678 JK', 'Suzuki', 'Vitara', 'SUV', 'Essence', 19230, 'available'],
        ['KN 3210 LM', 'Renault', 'Duster', 'SUV', 'Diesel', 35700, 'maintenance'],
        ['KN 1185 NP', 'Toyota', 'Corolla', 'Berline', 'Essence', 12400, 'available'],
        ['KN 6432 QR', 'Mitsubishi', 'L200', 'Pick-up', 'Diesel', 31200, 'available'],
    ];
    $stmt = $db->prepare('INSERT INTO vehicles(plate,make,model,type,fuel,mileage,status) VALUES(?,?,?,?,?,?,?)');
    foreach ($vehicles as $vehicle) $stmt->execute($vehicle);
    $stmt = $db->prepare('INSERT INTO movements(driver_id,vehicle_id,destination,purpose,start_at,expected_return,start_km,end_at,end_km,notes) VALUES(?,?,?,?,?,?,?,?,?,?)');
    $date = fn(string $offset) => date('Y-m-d H:i:00', strtotime($offset));
    $stmt->execute([3, 3, 'Gombe · Siège social', 'Mission de service', $date('-2 days -5 hours'), $date('-2 days -1 hour'), 15500, $date('-2 days -2 hours'), 15620, 'Documents remis au siège.']);
    $stmt->execute([5, 5, 'Limete · Entrepôt', 'Livraison', $date('-1 day -4 hours'), $date('-1 day'), 19150, $date('-1 day -1 hour'), 19230, '']);
    $stmt->execute([1, 1, 'Aéroport de N’djili', 'Transport de personnel', $date('-3 hours'), $date('+2 hours'), 28450, null, null, 'Accueil de l’équipe.']);
    $stmt->execute([2, 2, 'Matadi · Site logistique', 'Mission de service', $date('-2 hours'), $date('+7 hours'), 42180, null, null, '']);
    $stmt->execute([4, 4, 'Gombe · Bureau régional', 'Transport de personnel', $date('-1 hour'), $date('+3 hours'), 63890, null, null, '']);
}

function snapshot(PDO $db): array
{
    $admin = ($_SESSION['user']['role'] ?? '') === 'admin';
    $driverId = (int)($_SESSION['user']['driver_id'] ?? 0);
    $drivers = $db->query("SELECT d.*, EXISTS(SELECT 1 FROM movements m WHERE m.driver_id=d.id AND m.end_at IS NULL) AS on_trip FROM drivers d WHERE d.deleted_at IS NULL" . ($admin ? '' : " AND d.id=$driverId") . ' ORDER BY name')->fetchAll();
    $vehicles = $db->query("SELECT v.*, EXISTS(SELECT 1 FROM movements m WHERE m.vehicle_id=v.id AND m.end_at IS NULL) AS on_trip FROM vehicles v WHERE v.deleted_at IS NULL ORDER BY make, model, plate")->fetchAll();
    $movements = $db->query('SELECT m.*, d.name AS driver_name, v.plate, v.make, v.model FROM movements m JOIN drivers d ON d.id=m.driver_id JOIN vehicles v ON v.id=m.vehicle_id' . ($admin ? '' : " WHERE m.driver_id=$driverId") . ' ORDER BY m.start_at DESC,m.id DESC')->fetchAll();
    $accounts = $admin ? $db->query("SELECT u.id,u.name,u.email,u.role,u.driver_id,d.name AS driver_name FROM users u LEFT JOIN drivers d ON d.id=u.driver_id WHERE u.role='admin' OR (d.id IS NOT NULL AND d.deleted_at IS NULL) ORDER BY u.role,u.name")->fetchAll() : [];
    $userId = (int)$_SESSION['user']['id'];
    $refuelings = $db->query('SELECT r.*,v.plate,v.make,v.model,v.deleted_at AS vehicle_deleted_at FROM refuelings r JOIN vehicles v ON v.id=r.vehicle_id' . ($admin ? '' : " WHERE r.created_by=$userId") . ' ORDER BY r.filled_at DESC,r.id DESC')->fetchAll();
    // Juste les informations utiles à la saisie, sans les missions des autres chauffeurs.
    $selectableVehicles = $admin ? $vehicles : $db->query("SELECT v.id,v.plate,v.make,v.model,v.fuel,v.mileage,v.status,EXISTS(SELECT 1 FROM movements m WHERE m.vehicle_id=v.id AND m.end_at IS NULL) AS on_trip FROM vehicles v WHERE v.deleted_at IS NULL AND v.status='available' AND NOT EXISTS(SELECT 1 FROM movements m WHERE m.vehicle_id=v.id AND m.end_at IS NULL AND m.driver_id<>$driverId) ORDER BY v.make,v.model,v.plate")->fetchAll();
    return ['mobile_public_url' => $admin ? ($db->query("SELECT value FROM app_settings WHERE name='mobile_public_url'")->fetchColumn() ?: '') : '', 'drivers' => withPhotos($db, $drivers, 'driver'), 'vehicles' => withPhotos($db, $vehicles, 'vehicle'), 'selectable_vehicles' => $selectableVehicles, 'movements' => $movements, 'refuelings' => $refuelings, 'accounts' => $accounts, 'user' => $_SESSION['user'], 'demo' => !empty($_SESSION['demo_id']), 'csrf' => $_SESSION['csrf'], 'today' => date('Y-m-d'), 'now' => date('Y-m-d\TH:i'), 'timezone' => date_default_timezone_get()];
}
