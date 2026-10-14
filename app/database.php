<?php
declare(strict_types=1);

function mysqlIdentifier(string $name): string
{
    if (!preg_match('/^[a-zA-Z0-9_]{1,64}$/D', $name)) throw new RuntimeException('Identifiant MySQL incorrect.');
    return '`'.$name.'`';
}

function mysqlConnection(array $config, ?string $database = null): PDO
{
    $host = $config['host'] ?? '127.0.0.1';
    $port = (int)($config['port'] ?? 3306);
    if (!is_string($host) || !preg_match('/^[a-zA-Z0-9.:-]+$/D', $host) || $port < 1 || $port > 65535) throw new RuntimeException('Adresse MySQL incorrecte.');
    if ($database !== null) mysqlIdentifier($database);
    $db = new PDO('mysql:host='.$host.';port='.$port.';charset=utf8mb4'.($database === null ? '' : ';dbname='.$database), $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $db->exec("SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,NO_AUTO_VALUE_ON_ZERO'");
    $db->exec("SET SESSION time_zone='+00:00'");
    $db->exec('SET SESSION innodb_lock_wait_timeout=10');
    return $db;
}

function createMysqlSchema(PDO $db): void
{
    // DDL is restricted to installation and isolated demo databases, never business transactions.
    foreach (explode(';', (string)file_get_contents(__DIR__.'/mysql-schema.sql')) as $sql) {
        if (trim($sql) !== '') $db->exec($sql);
    }
}

function database(bool $production = false): PDO
{
    static $connections = [], $gate;
    if (!$gate) {
        $gate = fopen(dataDir().DIRECTORY_SEPARATOR.'database-migration.lock', 'c');
        if (!$gate || !flock($gate, LOCK_SH | LOCK_NB)) throw new PDOException('Migration de la base en cours.');
    }
    $path = dataDir().DIRECTORY_SEPARATOR.'database.json';
    if (!is_file($path)) throw new PDOException('Configuration MySQL absente. Installer ou migrer la base avant de démarrer.');
    $config = json_decode((string)file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
    if (($config['driver'] ?? '') !== 'mysql') throw new PDOException('DriverMan nécessite une base MySQL.');
    $name = $config['database'];
    $demo = !$production && !empty($_SESSION['demo_id']) ? $_SESSION['demo_id'] : null;
    if ($demo !== null) {
        if (!preg_match('/^[a-f0-9]{32}$/D', $demo) || empty($config['demo_prefix'])) throw new PDOException('Démonstration MySQL indisponible.');
        $name = $config['demo_prefix'].$demo;
        if ($name === $config['database']) throw new PDOException('La démonstration doit être isolée.');
    }
    mysqlIdentifier($name);
    if (isset($connections[$name])) return $connections[$name];
    if ($demo !== null) {
        $db = mysqlConnection($config);
        $lock = 'driverman-schema:'.substr(hash('sha256', $name), 0, 40);
        $statement = $db->prepare('SELECT GET_LOCK(?,10)');
        $statement->execute([$lock]);
        if ((int)$statement->fetchColumn() !== 1) throw new PDOException('Initialisation de la démonstration en cours.');
        try {
            $db->exec('CREATE DATABASE IF NOT EXISTS '.mysqlIdentifier($name).' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
            $db->exec('USE '.mysqlIdentifier($name));
            try { $version = $db->query('SELECT schema_version FROM app_write_lock WHERE id=1')->fetchColumn(); }
            catch (PDOException $error) {
                if (($error->errorInfo[1] ?? 0) !== 1146) throw $error;
                createMysqlSchema($db);
            }
        } finally { $db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lock]); }
    } else {
        $db = mysqlConnection($config, $name);
    }
    if ((int)$db->query('SELECT schema_version FROM app_write_lock WHERE id=1')->fetchColumn() !== 1) throw new PDOException('Version du schéma MySQL incorrecte.');
    return $connections[$name] = $db;
}
