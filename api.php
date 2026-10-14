<?php
declare(strict_types=1);
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($authorization !== '' || ($_GET['action'] ?? '') === 'mobile-login') define('DRIVERMAN_NATIVE_REQUEST', true);
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/tracking.php';
require __DIR__ . '/app/route-import.php';
require __DIR__ . '/app/notifications.php';
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

try {
    $action = $_GET['action'] ?? 'status';
    $method = $_SERVER['REQUEST_METHOD'];
    if (!is_string($action)) fail('Action incorrecte.', 400);
    $native = false;
    if (defined('DRIVERMAN_NATIVE_REQUEST')) {
        if ((empty($_SERVER['HTTPS']) || strtolower((string)$_SERVER['HTTPS'])==='off') && !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true)) fail('La connexion mobile nécessite HTTPS.', 403);
        if ($authorization !== '') {
            if (!preg_match('/^Bearer ([a-f0-9]{64})$/D', $authorization, $match)) fail('Connexion mobile invalide.', 401);
            $tokenHash = hash('sha256', $match[1]);
            $statement = database(true)->prepare("SELECT u.id,u.name,u.email,u.role,u.driver_id FROM mobile_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>? AND (u.role='admin' OR (u.role='driver' AND EXISTS(SELECT 1 FROM drivers d WHERE d.id=u.driver_id AND d.deleted_at IS NULL)))");
            $statement->execute([$tokenHash,time()]);
            $account = $statement->fetch();
            if (!$account) fail('Votre connexion mobile a expiré. Reconnectez-vous.', 401);
            $_SESSION['user'] = $account;
            $native = true;
        }
    }
    if (!in_array($action, ['status', 'bootstrap', 'export', 'photo', 'route', 'notifications'], true)) {
        if ($method !== 'POST') fail('Méthode non autorisée.', 405);
        if (!$native && $action !== 'mobile-login' && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Votre session a expiré. Actualisez la page.', 403);
    } elseif ($method !== 'GET') fail('Méthode non autorisée.', 405);
    if ($method === 'POST' && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 3 * 1024 * 1024) fail('L’envoi est trop volumineux. La photo ne doit pas dépasser 2 Mo.', 413);
    $multipart = str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data');
    $input = $method === 'POST' ? ($multipart ? $_POST : json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR)) : [];
    if (!is_array($input)) fail('Données incorrectes.', 400);

    if ($action === 'status') {
        $db = database(true);
        respond(['authenticated' => !empty($_SESSION['user']), 'needsSetup' => !(bool)$db->query('SELECT COUNT(*) FROM users')->fetchColumn(), 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'setup') {
        if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) fail('La création du premier compte doit se faire depuis cet ordinateur.', 403);
        $name = field($input, 'name', 100);
        $email = mb_strtolower(field($input, 'email', 150));
        $password = $input['password'] ?? '';
        if (!is_string($password)) fail('Mot de passe invalide.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Adresse e-mail invalide.');
        if (strlen($password) < 10 || strlen($password) > 72) fail('Le mot de passe doit contenir entre 10 et 72 caractères.');
        $db = database(true);
        $id = transaction($db, function () use ($db, $name, $email, $password) {
            if ($db->query('SELECT COUNT(*) FROM users')->fetchColumn()) throw new DomainException('Un espace existe déjà. Connectez-vous avec votre compte.');
            $db->prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)')->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            return (int)$db->lastInsertId();
        });
        regenerateSession();
        unset($_SESSION['demo_id']);
        $_SESSION['user'] = ['id' => $id, 'name' => $name, 'email' => $email, 'role' => 'admin', 'driver_id' => null];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['success' => true]);
    }

    if ($action === 'login' || $action === 'mobile-login') {
        $db = database(true);
        $address = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'local');
        $stmt = $db->prepare('SELECT * FROM login_attempts WHERE address=?');
        $stmt->execute([$address]);
        $attempt = $stmt->fetch();
        if ($attempt && $attempt['reset_at'] > time() && $attempt['attempts'] >= 8) fail('Trop de tentatives. Réessayez dans 15 minutes.', 429);
        $email = mb_strtolower(field($input, 'email', 150));
        $stmt = $db->prepare("SELECT u.* FROM users u WHERE u.email=? AND (u.role='admin' OR EXISTS(SELECT 1 FROM drivers d WHERE d.id=u.driver_id AND d.deleted_at IS NULL))");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $password = $input['password'] ?? '';
        if (!is_string($password) || strlen($password) > 72 || $password === '') fail('Mot de passe invalide.');
        if (!$user || !password_verify($password, $user['password'])) {
            $db->prepare('INSERT INTO login_attempts(address,attempts,reset_at) VALUES(?,1,?) AS incoming ON DUPLICATE KEY UPDATE attempts=CASE WHEN login_attempts.reset_at < ? THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at < ? THEN incoming.reset_at ELSE login_attempts.reset_at END')->execute([$address, time()+900, time(), time()]);
            fail('Adresse e-mail ou mot de passe incorrect.', 401);
        }
        $db->prepare('DELETE FROM login_attempts WHERE address=?')->execute([$address]);
        if ($action === 'mobile-login') {
            if (!in_array($user['role'], ['admin','driver'], true)) fail('Ce compte ne peut pas accéder à l’application mobile.', 403);
            $token = bin2hex(random_bytes(32));
            $db->prepare('DELETE FROM mobile_tokens WHERE expires_at<=?')->execute([time()]);
            $db->prepare('INSERT INTO mobile_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)')->execute([hash('sha256',$token),$user['id'],time()+30*86400]);
            respond(['success'=>true,'token'=>$token,'user_id'=>$user['id']]);
        }
        regenerateSession();
        unset($_SESSION['demo_id']);
        unset($user['password']);
        $_SESSION['user'] = $user;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['success' => true]);
    }

    if ($action === 'demo') {
        regenerateSession();
        $_SESSION['demo_id'] ??= bin2hex(random_bytes(16));
        $_SESSION['user'] = ['id' => 0, 'name' => 'Alex Morgan', 'email' => 'Espace de démonstration', 'role' => 'admin', 'driver_id' => null];
        $db = database();
        if (!$db->query('SELECT COUNT(*) FROM vehicles')->fetchColumn()) transaction($db, fn() => seedDemo($db));
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['success' => true]);
    }

    if (empty($_SESSION['user'])) fail('Veuillez vous connecter pour continuer.', 401);
    $db = database();
    // L'autorisation repose sur le compte en base, jamais sur les champs du navigateur.
    if (empty($_SESSION['demo_id'])) {
        $statement = $db->prepare("SELECT u.id,u.name,u.email,u.role,u.driver_id FROM users u WHERE u.id=? AND (u.role='admin' OR EXISTS(SELECT 1 FROM drivers d WHERE d.id=u.driver_id AND d.deleted_at IS NULL))");
        $statement->execute([$_SESSION['user']['id']]);
        $account = $statement->fetch();
        if (!$account) { unset($_SESSION['user']); fail('Ce compte n’est plus disponible.', 401); }
        $_SESSION['user'] = $account;
    } else {
        $_SESSION['user']['role'] ??= 'admin';
        $_SESSION['user']['driver_id'] ??= null;
    }
    $admin = $_SESSION['user']['role'] === 'admin';
    if ($action === 'demo-view') {
        if (empty($_SESSION['demo_id'])) fail('Cette action est réservée à la démonstration.', 403);
        $role = choice($input, 'role', ['admin','driver']);
        $driver = $db->query('SELECT id,name FROM drivers WHERE deleted_at IS NULL ORDER BY id LIMIT 1')->fetch();
        if ($role === 'driver' && !$driver) fail('Ajoutez un chauffeur avant d’ouvrir la vue chauffeur.');
        $_SESSION['user'] = $role === 'admin'
            ? ['id'=>0,'name'=>'Alex Morgan','email'=>'Espace de démonstration','role'=>'admin','driver_id'=>null]
            : ['id'=>-1,'name'=>$driver['name'],'email'=>'Espace de démonstration','role'=>'driver','driver_id'=>$driver['id']];
        respond(['success' => true]);
    }
    if (in_array($action, ['save-driver','save-vehicle','delete-driver','delete-vehicle','create-user','save-mobile-settings'], true) && !$admin) {
        fail('Cette action est réservée aux administrateurs.', 403);
    }
    if ($action === 'logout') {
        $db->prepare('DELETE FROM push_devices WHERE user_id=? AND binding=?')->execute([$_SESSION['user']['id'],pushBinding()]);
        if ($native) {
            $db->prepare('DELETE FROM mobile_tokens WHERE token_hash=?')->execute([$tokenHash]);
            respond(['success'=>true]);
        }
        $_SESSION = [];
        regenerateSession();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['success' => true]);
    }
    if ($action === 'bootstrap') respond(snapshot($db));
    if (in_array($action,['notifications','save-notification-preferences','read-notifications','subscribe-push','unsubscribe-push'],true)) notificationAction($db,$action,$input,$admin);
    if ($action === 'route' || $action === 'save-positions') trackingAction($db, $action, $input, $admin);
    if ($action === 'preview-route' || $action === 'import-route') importRouteAction($db, $action, $input, $admin);
    if ($action === 'save-mobile-settings') {
        $url = field($input,'public_url',2048,false);
        if ($url !== '') {
            $parts=parse_url($url);
            if (!filter_var($url,FILTER_VALIDATE_URL) || !$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) fail('Indiquez une adresse HTTPS sans identifiants, paramètres ou fragment.');
            $url=rtrim($url,'/').'/';
        }
        $db->prepare('INSERT INTO app_settings(name,value) VALUES(?,?) AS incoming ON DUPLICATE KEY UPDATE value=incoming.value')->execute(['mobile_public_url',$url]);
        respond(['success'=>true]);
    }

    if ($action === 'change-password') {
        if (!empty($_SESSION['demo_id'])) fail('Le mot de passe ne peut pas être modifié dans la démonstration.', 403);
        $current = $input['current_password'] ?? '';
        $password = $input['new_password'] ?? '';
        if (!is_string($current) || !is_string($password) || strlen($current) > 72) fail('Mot de passe invalide.');
        if (strlen($password) < 10 || strlen($password) > 72) fail('Le nouveau mot de passe doit contenir entre 10 et 72 caractères.');
        $key = 'password:' . $_SESSION['user']['id'];
        $statement = $db->prepare('SELECT attempts,reset_at FROM login_attempts WHERE address=?');
        $statement->execute([$key]);
        $attempt = $statement->fetch();
        if ($attempt && $attempt['reset_at'] > time() && $attempt['attempts'] >= 8) fail('Trop de tentatives. Réessayez dans 15 minutes.', 429);
        $statement = $db->prepare('SELECT password FROM users WHERE id=?');
        $statement->execute([$_SESSION['user']['id']]);
        if (!password_verify($current, $statement->fetchColumn())) {
            $db->prepare('INSERT INTO login_attempts(address,attempts,reset_at) VALUES(?,1,?) AS incoming ON DUPLICATE KEY UPDATE attempts=CASE WHEN login_attempts.reset_at < ? THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at < ? THEN incoming.reset_at ELSE login_attempts.reset_at END')->execute([$key,time()+900,time(),time()]);
            fail('Le mot de passe actuel est incorrect.');
        }
        $db->prepare('UPDATE users SET password=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT),$_SESSION['user']['id']]);
        $db->prepare('DELETE FROM mobile_tokens WHERE user_id=?')->execute([$_SESSION['user']['id']]);
        $db->prepare('DELETE FROM login_attempts WHERE address=?')->execute([$key]);
        regenerateSession();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['success' => true, 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'photo') {
        $type = choice($_GET, 'type', ['driver','vehicle']);
        $id = integer($_GET, 'id');
        if (!$admin) {
            $driverId = (int)$_SESSION['user']['driver_id'];
            $allowed = $type === 'driver' && $id === $driverId;
            if ($type === 'vehicle') {
                $statement = $db->prepare('SELECT 1 FROM vehicles WHERE id=? AND deleted_at IS NULL');
                $statement->execute([$id]);
                $allowed = (bool)$statement->fetchColumn();
            }
            if (!$allowed) fail('Photo non accessible.', 403);
        }
        $statement = $db->prepare('SELECT content FROM resource_photos WHERE resource_type=? AND resource_id=?');
        $statement->execute([$type, $id]);
        $photo = $statement->fetchColumn();
        if ($photo === false) fail('Aucune photo enregistrée.', 404);
        header('Content-Type: image/jpeg');
        header('Content-Length: ' . strlen($photo));
        header('Cache-Control: private, no-store');
        echo $photo;
        exit;
    }

    if ($action === 'create-user') {
        $role = choice($input, 'role', ['admin','driver']);
        $email = mb_strtolower(field($input, 'email', 150));
        $password = $input['password'] ?? '';
        if (!is_string($password)) fail('Mot de passe invalide.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Adresse e-mail invalide.');
        if (strlen($password) < 10 || strlen($password) > 72) fail('Le mot de passe doit contenir entre 10 et 72 caractères.');
        $driverId = $role === 'driver' ? integer($input, 'driver_id') : null;
        $name = $role === 'admin' ? field($input, 'name', 100) : '';
        transaction($db, function () use ($db, $role, $email, $password, $driverId, $name) {
            if ($driverId !== null) {
                $driver = row($db, 'drivers', $driverId);
                $name = $driver['name'];
            }
            $db->prepare('INSERT INTO users(name,email,password,role,driver_id) VALUES(?,?,?,?,?)')->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT),$role,$driverId]);
        });
        respond(['success' => true]);
    }

    if ($action === 'save-refueling') {
        $vehicleId = integer($input, 'vehicle_id');
        $at = moment($input, 'filled_at');
        if ($at > date('Y-m-d H:i:s', time()+60)) fail('Le ravitaillement ne peut pas être dans le futur.');
        $mileage = integer($input, 'mileage');
        $liters = thousandths($input, 'liters', 10000, true);
        $price = thousandths($input, 'unit_price', 10000000);
        $currency = choice($input, 'currency', ['USD','CDF']);
        $full = choice($input, 'full_tank', ['0','1']);
        $latitude = coordinate($input, 'latitude', -90, 90);
        $longitude = coordinate($input, 'longitude', -180, 180);
        $accuracy = coordinate($input, 'accuracy', 0, 10000000);
        if ($accuracy !== null && $accuracy <= 0) fail('La précision de la position doit être supérieure à zéro.');
        if (($latitude === null) !== ($longitude === null) || ($accuracy !== null && $latitude === null)) fail('Renseignez la latitude et la longitude ensemble.');
        $station = field($input, 'station', 150, false);
        $notes = field($input, 'notes', 1000, false);
        transaction($db, function () use ($db, $vehicleId, $at, $mileage, $liters, $price, $currency, $full, $latitude, $longitude, $accuracy, $station, $notes, $admin) {
            $vehicle = row($db, 'vehicles', $vehicleId);
            if (!$admin) {
                $statement = $db->prepare('SELECT 1 FROM movements WHERE vehicle_id=? AND end_at IS NULL AND driver_id<>? LIMIT 1');
                $statement->execute([$vehicleId, (int)$_SESSION['user']['driver_id']]);
                if ($vehicle['status'] !== 'available' || $statement->fetchColumn()) {
                    throw new DomainException('Choisissez un véhicule disponible ou celui de votre mission en cours.', 403);
                }
            }
            if ($vehicle['fuel'] === 'Électrique') throw new DomainException('Ce véhicule électrique ne peut pas recevoir de carburant en litres.');
            // Vérifier les saisies antidatées sans abaisser le compteur actuel.
            $statement = $db->prepare('SELECT at,km FROM (SELECT filled_at AS at,mileage AS km FROM refuelings WHERE vehicle_id=? UNION ALL SELECT start_at,start_km FROM movements WHERE vehicle_id=? UNION ALL SELECT end_at,end_km FROM movements WHERE vehicle_id=? AND end_at IS NOT NULL) AS readings ORDER BY at');
            $statement->execute([$vehicleId,$vehicleId,$vehicleId]);
            $readings = $statement->fetchAll();
            foreach ($readings as $reading) {
                if (($reading['at'] <= $at && $reading['km'] > $mileage) || ($reading['at'] >= $at && $reading['km'] < $mileage)) throw new DomainException('Ce kilométrage contredit un compteur enregistré avant ou après ce ravitaillement.');
            }
            if ((!$readings || $at >= $readings[array_key_last($readings)]['at']) && $mileage < $vehicle['mileage']) throw new DomainException('Le kilométrage ne peut pas être inférieur au compteur actuel.');
            $db->prepare('INSERT INTO refuelings(vehicle_id,filled_at,mileage,liters_ml,unit_price_milli,currency,full_tank,latitude,longitude,accuracy,station,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$vehicleId,$at,$mileage,$liters,$price,$currency,$full,$latitude,$longitude,$accuracy,$station,$notes,$_SESSION['user']['id']]);
            recordNotification($db,'fuel',(int)$db->lastInsertId(),'Achat de carburant',$_SESSION['user']['name'].' · '.$vehicle['plate'].' · '.number_format($liters/1000,2,',',' ').' L · '.number_format($liters*$price/1000000,2,',',' ').' '.$currency);
            $db->prepare('UPDATE vehicles SET mileage=GREATEST(mileage,CAST(? AS SIGNED)) WHERE id=?')->execute([$mileage,$vehicleId]);
        });
        dispatchPushAfterResponse($db);
        respond(['success' => true]);
    }

    if ($action === 'delete-driver' || $action === 'delete-vehicle') {
        $id = integer($input, 'id');
        $type = $action === 'delete-driver' ? 'driver' : 'vehicle';
        $table = $type === 'driver' ? 'drivers' : 'vehicles';
        transaction($db, function () use ($db, $id, $type, $table) {
            row($db, $table, $id);
            if (activeFor($db, $type . '_id', $id)) {
                throw new DomainException($type === 'driver'
                    ? 'Enregistrez le retour de ce chauffeur avant de le supprimer.'
                    : 'Enregistrez le retour de ce véhicule avant de le supprimer.');
            }
            $db->prepare("UPDATE $table SET deleted_at=? WHERE id=?")->execute([date('Y-m-d H:i:s'), $id]);
            $db->prepare('DELETE FROM resource_photos WHERE resource_type=? AND resource_id=?')->execute([$type, $id]);
        });
        respond(['success' => true]);
    }

    if ($action === 'save-driver') {
        $id = integer($input, 'id');
        $values = [field($input, 'name', 100), field($input, 'phone', 40), mb_strtoupper(field($input, 'license', 50)), moment($input, 'license_expiry', true), choice($input, 'status', ['available','offline'])];
        $photo = uploadedPhoto('driver');
        $removePhoto = field($input, 'remove_photo', 1, false) === '1';
        transaction($db, function () use ($db, $id, $values, $photo, $removePhoto) {
            if ($id) {
                row($db, 'drivers', $id);
                if (activeFor($db, 'driver_id', $id) && $values[4] !== 'available') throw new DomainException('Enregistrez le retour de ce chauffeur avant de le rendre indisponible.');
                $db->prepare('UPDATE drivers SET name=?,phone=?,license=?,license_expiry=?,status=? WHERE id=?')->execute([...$values, $id]);
                $db->prepare('UPDATE users SET name=? WHERE driver_id=?')->execute([$values[0],$id]);
            } else {
                $db->prepare('INSERT INTO drivers(name,phone,license,license_expiry,status) VALUES(?,?,?,?,?)')->execute($values);
                $id = (int)$db->lastInsertId();
            }
            savePhoto($db, 'driver', $id, $photo, $removePhoto);
        });
        respond(['success' => true]);
    }

    if ($action === 'save-vehicle') {
        $id = integer($input, 'id');
        $values = [mb_strtoupper(field($input, 'plate', 30)), field($input, 'make', 60), field($input, 'model', 60), field($input, 'type', 60), choice($input, 'fuel', ['Diesel','Essence','Hybride','Électrique']), integer($input, 'mileage'), choice($input, 'status', ['available','maintenance'])];
        $photo = uploadedPhoto('vehicle');
        $removePhoto = field($input, 'remove_photo', 1, false) === '1';
        transaction($db, function () use ($db, $id, $values, $photo, $removePhoto) {
            if ($id) {
                $vehicle = row($db, 'vehicles', $id);
                if ($values[5] < $vehicle['mileage']) throw new DomainException('Le compteur ne peut pas être inférieur au kilométrage déjà enregistré.');
                if (activeFor($db, 'vehicle_id', $id) && ($values[6] !== 'available' || $values[5] !== (int)$vehicle['mileage'])) throw new DomainException('Enregistrez le retour avant de modifier le compteur ou de mettre le véhicule en maintenance.');
                $db->prepare('UPDATE vehicles SET plate=?,make=?,model=?,type=?,fuel=?,mileage=?,status=? WHERE id=?')->execute([...$values, $id]);
            } else {
                $db->prepare('INSERT INTO vehicles(plate,make,model,type,fuel,mileage,status) VALUES(?,?,?,?,?,?,?)')->execute($values);
                $id = (int)$db->lastInsertId();
            }
            savePhoto($db, 'vehicle', $id, $photo, $removePhoto);
        });
        respond(['success' => true]);
    }

    if ($action === 'depart') {
        $driverId = $admin ? integer($input, 'driver_id') : (int)$_SESSION['user']['driver_id'];
        if (!$admin && isset($input['driver_id']) && integer($input, 'driver_id') !== $driverId) {
            fail('Vous pouvez uniquement créer une course à votre nom.', 403);
        }
        $vehicleId = integer($input, 'vehicle_id');
        $start = moment($input, 'start_at');
        $expected = field($input, 'expected_return', 20, false);
        if ($expected !== '') $expected = moment($input, 'expected_return');
        $km = integer($input, 'start_km');
        $destination = field($input, 'destination', 150);
        $purpose = choice($input, 'purpose', ['Mission de service','Transport de personnel','Livraison','Déplacement administratif','Autre']);
        $notes = field($input, 'notes', 1000, false);
        if ($start > date('Y-m-d H:i:s', time()+60)) fail('Le départ ne peut pas être dans le futur.');
        if ($expected !== '' && $expected <= $start) fail('Le retour prévu doit être après le départ.');
        transaction($db, function () use ($db, $driverId, $vehicleId, $start, $expected, $km, $destination, $purpose, $notes) {
            $driver = row($db, 'drivers', $driverId);
            $vehicle = row($db, 'vehicles', $vehicleId);
            if ($driver['status'] !== 'available' || activeFor($db, 'driver_id', $driverId)) throw new DomainException('Ce chauffeur est déjà en mission ou indisponible.');
            if ($driver['license_expiry'] < substr($start, 0, 10)) throw new DomainException('Le permis de ce chauffeur est expiré. Mettez sa fiche à jour.');
            if ($vehicle['status'] !== 'available' || activeFor($db, 'vehicle_id', $vehicleId)) throw new DomainException('Ce véhicule est déjà en déplacement ou en maintenance.');
            if ($km < $vehicle['mileage']) throw new DomainException('Le kilométrage de départ ne peut pas être inférieur au compteur du véhicule.');
            $statement = $db->prepare('SELECT 1 FROM refuelings WHERE vehicle_id=? AND filled_at>=? AND mileage<? LIMIT 1');
            $statement->execute([$vehicleId,$start,$km]);
            if ($statement->fetchColumn()) throw new DomainException('Le kilométrage du départ contredit un ravitaillement postérieur.');
            $stmt = $db->prepare('SELECT MAX(end_at) FROM movements WHERE driver_id=? OR vehicle_id=?');
            $stmt->execute([$driverId, $vehicleId]);
            if (($lastReturn = $stmt->fetchColumn()) && $start < $lastReturn) throw new DomainException('Le départ doit être après le dernier retour de ce chauffeur et de ce véhicule.');
            $db->prepare('INSERT INTO movements(driver_id,vehicle_id,destination,purpose,start_at,expected_return,start_km,notes) VALUES(?,?,?,?,?,?,?,?)')->execute([$driverId,$vehicleId,$destination,$purpose,$start,$expected,$km,$notes]);
            recordNotification($db,'departure',(int)$db->lastInsertId(),'Départ d’une course',$driver['name'].' · '.$vehicle['plate'].' → '.$destination);
            $db->prepare('UPDATE vehicles SET mileage=? WHERE id=?')->execute([$km,$vehicleId]);
        });
        dispatchPushAfterResponse($db);
        respond(['success' => true]);
    }

    if ($action === 'return') {
        $id = integer($input, 'id');
        $end = moment($input, 'end_at');
        $km = integer($input, 'end_km');
        if ($end > date('Y-m-d H:i:s', time()+60)) fail('Le retour ne peut pas être dans le futur.');
        transaction($db, function () use ($db, $id, $end, $km, $admin) {
            $movement = row($db, 'movements', $id);
            if (!$admin && (int)$movement['driver_id'] !== (int)$_SESSION['user']['driver_id']) {
                throw new DomainException('Vous pouvez uniquement enregistrer le retour de vos propres missions.', 403);
            }
            if ($movement['end_at']) throw new DomainException('Le retour de ce mouvement est déjà enregistré.');
            if ($end < $movement['start_at']) throw new DomainException('Le retour doit être après le départ.');
            $lastPosition=$db->prepare('SELECT MAX(recorded_at) FROM movement_positions WHERE movement_id=?');
            $lastPosition->execute([$id]);
            $lastRecorded=$lastPosition->fetchColumn();
            if ($lastRecorded && (int)$lastRecorded>(new DateTimeImmutable($end))->getTimestamp()*1000+59999) throw new DomainException('L’heure du retour ne peut pas précéder les dernières positions GPS enregistrées.');
            if ($km < $movement['start_km']) throw new DomainException('Le kilométrage de retour ne peut pas être inférieur à celui du départ.');
            $vehicle = row($db, 'vehicles', (int)$movement['vehicle_id']);
            if ($km < $vehicle['mileage']) throw new DomainException('Le retour ne peut pas abaisser le compteur enregistré, notamment lors d’un ravitaillement.');
            $statement = $db->prepare('SELECT 1 FROM refuelings WHERE vehicle_id=? AND filled_at>=? AND filled_at>? LIMIT 1');
            $statement->execute([$movement['vehicle_id'],$movement['start_at'],$end]);
            if ($statement->fetchColumn()) throw new DomainException('Le retour doit être après le ravitaillement enregistré pendant cette mission.');
            $db->prepare('UPDATE movements SET end_at=?,end_km=? WHERE id=?')->execute([$end,$km,$id]);
            $db->prepare('UPDATE vehicles SET mileage=? WHERE id=?')->execute([$km,$movement['vehicle_id']]);
        });
        respond(['success' => true]);
    }

    if ($action === 'export') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="driverman-mouvements-' . date('Y-m-d') . '.csv"');
        $output = fopen('php://output', 'w');
        fwrite($output, "\xEF\xBB\xBF");
        fputcsv($output, ['Chauffeur','Immatriculation','Véhicule','Destination','Motif','Départ','Retour prévu','Retour réel','Km départ','Km retour','Distance (km)','Statut','Notes'], ';', '"', '');
        foreach (snapshot($db)['movements'] as $m) {
            $values = [$m['driver_name'],$m['plate'],$m['make'].' '.$m['model'],$m['destination'],$m['purpose'],$m['start_at'],$m['expected_return'],$m['end_at'],$m['start_km'],$m['end_km'],$m['end_at'] ? $m['end_km']-$m['start_km'] : '',$m['end_at'] ? 'Terminé' : 'En cours',$m['notes']];
            $values = array_map(fn($v) => preg_match('/^[\s]*[=+@\-\t\r]/u', (string)$v) ? "'" . $v : $v, $values);
            fputcsv($output, $values, ';', '"', '');
        }
        fclose($output);
        exit;
    }
    fail('Action inconnue.', 404);
} catch (JsonException $e) {
    fail('Données JSON incorrectes.', 400);
} catch (DomainException $e) {
    fail($e->getMessage(), $e->getCode() === 403 ? 403 : 422);
} catch (PDOException $e) {
    error_log('DriverMan database: ' . $e->getMessage());
    if (str_contains($e->getMessage(), 'users_email')) fail('Un compte utilise déjà cette adresse e-mail.', 409);
    if (str_contains($e->getMessage(), 'users_driver_id')) fail('Ce chauffeur possède déjà un compte.', 409);
    if (str_contains($e->getMessage(), 'refuelings_vehicle_date')) fail('Un ravitaillement existe déjà pour ce véhicule à cette date et cette heure.', 409);
    if (($e->errorInfo[1] ?? 0) === 1062) fail('Cette immatriculation ou ce permis est déjà enregistré, ou cette ressource est déjà en mission.', 409);
    fail('La base de données est momentanément indisponible. Réessayez.', 503);
} catch (Throwable $e) {
    error_log('DriverMan: ' . $e->getMessage());
    fail('Une erreur est survenue. Vérifiez la configuration du serveur.', 500);
}
