<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__).'/app/database.php';
$dir = getenv('DRIVERMAN_DATA_DIR');
if (!$dir || !is_dir($dir) || !str_starts_with(basename($dir), 'driverman-')) throw new RuntimeException('Répertoire de test isolé requis.');
$admin = ['host'=>getenv('DRIVERMAN_MYSQL_ADMIN_HOST') ?: '127.0.0.1', 'port'=>(int)(getenv('DRIVERMAN_MYSQL_ADMIN_PORT') ?: 3306),
    'username'=>getenv('DRIVERMAN_MYSQL_ADMIN_USER') ?: 'root', 'password'=>getenv('DRIVERMAN_MYSQL_ADMIN_PASSWORD') ?: ''];
$db = mysqlConnection($admin);
$configPath = $dir.'/database.json';
if (($argv[1] ?? '') === 'init') {
    if (file_exists($configPath)) throw new RuntimeException('Configuration de test déjà présente.');
    $name = 'driverman_test_'.bin2hex(random_bytes(5));
    $db->exec('CREATE DATABASE '.mysqlIdentifier($name).' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    $db->exec('USE '.mysqlIdentifier($name));
    createMysqlSchema($db);
    file_put_contents($configPath, json_encode($admin + ['driver'=>'mysql','database'=>$name,'demo_prefix'=>$name.'_demo_'], JSON_THROW_ON_ERROR));
    chmod($configPath, 0600);
    echo "Base de test MySQL créée.\n";
} elseif (($argv[1] ?? '') === 'cleanup') {
    $config = json_decode((string)file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
    $name = $config['database'];
    if (!preg_match('/^driverman_test_[a-f0-9]{10}$/D', $name)) throw new RuntimeException('Suppression limitée aux bases de test.');
    foreach ($db->query('SHOW DATABASES')->fetchAll(PDO::FETCH_COLUMN) as $candidate) {
        if ($candidate === $name || preg_match('/^'.preg_quote($name, '/').'_demo_[a-f0-9]{32}$/D', $candidate)) {
            $db->exec('DROP DATABASE '.mysqlIdentifier($candidate));
        }
    }
    unlink($configPath);
    echo "Bases de test MySQL supprimées.\n";
} else throw new RuntimeException('Action inconnue.');
