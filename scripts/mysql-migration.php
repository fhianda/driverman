<?php
declare(strict_types=1);
// Only used by the CLI migration and its tests. SQLite is never opened by the application.
function sqliteBackup(string $source, string $destination): void
{
    if (!is_file($source) || file_exists($destination)) throw new RuntimeException('Source absente ou sauvegarde déjà existante.');
    $original = new SQLite3($source, SQLITE3_OPEN_READONLY);
    $backup = new SQLite3($destination, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
    if (!$original->backup($backup) || $backup->querySingle('PRAGMA integrity_check') !== 'ok') throw new RuntimeException('Sauvegarde SQLite invalide.');
    $backup->close(); $original->close(); chmod($destination, 0600);
}

function migrateSqliteData(string $source, PDO $target): array
{
    $tables = ['drivers','vehicles','users','login_attempts','movements','resource_photos','refuelings','mobile_tokens','app_settings',
        'notification_preferences','notifications','push_devices','push_jobs','movement_positions','movement_routes'];
    $sqlite = new PDO('sqlite:'.$source, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $sqlite->exec('PRAGMA query_only=ON');
    if ($sqlite->query('PRAGMA integrity_check')->fetchColumn() !== 'ok' || $sqlite->query('PRAGMA foreign_key_check')->fetch()) throw new RuntimeException('Intégrité SQLite incorrecte.');
    $present = $sqlite->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
    if (array_diff($present, $tables)) throw new RuntimeException('Table SQLite inconnue : migration arrêtée pour éviter une perte de données.');
    foreach ($tables as $table) if ((int)$target->query('SELECT COUNT(*) FROM '.mysqlIdentifier($table))->fetchColumn() !== 0) throw new RuntimeException('La destination MySQL doit être vide.');
    $report = [];
    $target->beginTransaction();
    try {
        foreach ($tables as $table) {
            if (!in_array($table, $present, true)) continue;
            $columns = $sqlite->query("PRAGMA table_info($table)")->fetchAll();
            $names = array_column($columns, 'name');
            $primary = array_filter($columns, static fn($c)=>(int)$c['pk']>0);
            usort($primary, static fn($a,$b)=>$a['pk']<=>$b['pk']);
            if (!$primary) throw new RuntimeException('Clé primaire absente : '.$table);
            $fieldList = implode(',', array_map('mysqlIdentifier', $names));
            $query = 'SELECT '.$fieldList.' FROM '.mysqlIdentifier($table).' ORDER BY '.implode(',', array_map('mysqlIdentifier', array_column($primary, 'name')));
            $insert = $target->prepare('INSERT INTO '.mysqlIdentifier($table).'('.$fieldList.') VALUES('.implode(',', array_fill(0,count($names),'?')).')');
            $sourceHash = hash_init('sha256'); $count = 0;
            $normalize = static function(array $row) use($columns): string {
                $values=[];
                foreach ($columns as $column) {
                    $value=$row[$column['name']];
                    $values[]=$value===null ? null : (str_contains(strtoupper($column['type']), 'REAL') ? bin2hex(pack('d',(float)$value)) : (string)$value);
                }
                return serialize($values);
            };
            foreach ($sqlite->query($query) as $row) {
                foreach ($columns as $i=>$column) {
                    $value=$row[$column['name']];
                    $type=$value===null ? PDO::PARAM_NULL : (strtoupper($column['type'])==='BLOB' ? PDO::PARAM_LOB : (is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR));
                    $insert->bindValue($i+1, is_float($value)?sprintf('%.17g',$value):$value, $type);
                }
                $insert->execute(); hash_update($sourceHash,$normalize($row)); $count++;
            }
            $targetHash=hash_init('sha256'); $copied=0;
            foreach ($target->query($query) as $row) { hash_update($targetHash,$normalize($row)); $copied++; }
            $checksum=hash_final($sourceHash);
            if ($count!==$copied || !hash_equals($checksum,hash_final($targetHash))) throw new RuntimeException('Vérification de migration échouée : '.$table);
            $report[$table]=['rows'=>$count,'sha256'=>$checksum];
        }
        $target->commit();
    } catch (Throwable $error) {
        if ($target->inTransaction()) $target->rollBack();
        throw $error;
    }
    return $report;
}
