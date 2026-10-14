# Base MySQL de DriverMan

DriverMan utilise **MySQL 8.4 ou supérieur**, avec PHP 8.2 minimum et `pdo_mysql`. La base principale locale se nomme `driverman`, sur `127.0.0.1:3306`. Les tables sont en InnoDB, avec `utf8mb4_0900_bin` pour conserver les accents, les caractères Unicode et les comparaisons sensibles à la casse de l’ancienne installation.

La connexion web, Android et PWA passe par la même API PHP. Les identifiants MySQL ne sont jamais envoyés au navigateur ni inclus dans l’APK. Aucun fichier SQLite n’est ouvert par le code applicatif et aucune base vide SQLite ne sera créée en cas de panne MySQL.

## Configuration privée

`DRIVERMAN_DATA_DIR/database.json` contient `driver` (`mysql`), `host`, `port`, `database`, `username`, `password` et `demo_prefix`. Par défaut, ce répertoire est `C:\wamp64\driverman-data`, hors de la racine web. Protéger ses fichiers avec les permissions du système ; ils doivent être lisibles par le service PHP et par l’administrateur uniquement. Ne pas publier ce fichier ni le mot de passe.

Le compte local `driverman_app@localhost` possède seulement SELECT, INSERT, UPDATE et DELETE sur le parc réel. Le compte administrateur MySQL sert uniquement à installer et migrer le schéma. L’application n’utilise pas `root`.

Les démonstrations utilisent des bases distinctes `driverman_demo_<32 caractères hexadécimaux>`. Le compte applicatif dispose des droits de création de schéma et de tables uniquement sur ce préfixe réservé. Pour désactiver la démonstration sur un hébergeur ne permettant pas ces droits, utiliser `"demo_prefix": null` ; le parc réel reste disponible. Les bases de démonstration peuvent être nettoyées par l’administrateur MySQL une fois leurs sessions inutilisées.

## Migration depuis SQLite

1. Sauvegarder le code et préparer la version MySQL. Le script nécessite les extensions `sqlite3` et `pdo_sqlite` uniquement pour lire et sauvegarder les anciennes bases ; elles ne sont pas utilisées en exploitation.
2. Empêcher les écritures de l’ancienne version pendant la migration. La bascule locale utilise `database-migration.lock` : les requêtes détiennent un verrou partagé jusqu’à leur fin ; le script prend le verrou exclusif. Une requête pendant la migration reçoit une indisponibilité temporaire. Pour une autre installation, mettre le site et les workers en maintenance si cette protection n’est pas déjà installée.
3. Exécuter `php scripts/migrate-mysql.php --data-dir="C:\wamp64\driverman-data" --database=driverman` depuis la version préparée. L’option `--deploy-to="C:\wamp64\www\driverman"` installe également les fichiers adaptés, avec sauvegarde et restauration du code si la bascule échoue.
4. Le script crée une sauvegarde SQLite cohérente, incluant les transactions du journal WAL, dans `backups/mysql-<date>-<identifiant>`. Il importe aussi les anciennes bases de démonstration, préserve les identifiants, les mots de passe hachés et les photos, puis compare chaque table ligne par ligne par empreinte SHA-256. Le fichier `migration-report.json` conserve les comptes de lignes et les empreintes sans les données privées.
5. La configuration MySQL n’est activée qu’après validation. Le script refuse une base ou un compte applicatif déjà existant et ne supprime aucune ancienne base. Après un échec, inspecter les destinations nouvellement créées avant toute reprise : elles restent disponibles pour diagnostic.

Les paramètres administrateur proviennent de `DRIVERMAN_MYSQL_ADMIN_HOST`, `DRIVERMAN_MYSQL_ADMIN_PORT`, `DRIVERMAN_MYSQL_ADMIN_USER` et `DRIVERMAN_MYSQL_ADMIN_PASSWORD`. Les valeurs locales par défaut sont `127.0.0.1`, `3306`, `root` et un mot de passe vide, correspondant à l’installation Wamp initiale. Elles ne sont jamais utilisées pour la connexion courante de l’application et doivent être adaptées sur un autre serveur.

## Sauvegarde et restauration

Sauvegarder MySQL avec `mysqldump --single-transaction --hex-blob --databases driverman`, en fournissant les identifiants via une option sécurisée du client ou une saisie interactive, jamais en clair dans une commande enregistrée. Sauvegarder séparément `database.json` et `push.json` dans un emplacement privé.

Les fichiers SQLite conservés sont un instantané historique : ils ne contiennent pas les opérations ajoutées après la migration. Ne pas réactiver l’ancien code après utilisation de MySQL sans transférer les nouvelles données. Pour restaurer une sauvegarde MySQL, passer en maintenance et restaurer le dump avec le compte administrateur, puis vérifier les comptes de lignes avant réouverture.

Le domaine public doit recevoir sa propre base MySQL et sa configuration privée lors du déploiement. La migration locale ne déploie rien automatiquement sur `driverman.trackkintrans.com`.

## Vérification

`npm test` inclut l’intégration métier, les notifications, la migration et la concurrence MySQL. `npm run test:mysql` exécute seulement les contrôles de migration et de concurrence. Les tests utilisent les paramètres administrateur ci-dessus pour créer des bases `driverman_test_<identifiant>`, puis les suppriment avec un contrôle strict du nom ; ils ne modifient pas `driverman`.

Les contraintes MySQL empêchent deux courses ouvertes pour le même chauffeur ou véhicule. Le verrou InnoDB `app_write_lock` sérialise les vérifications métier dans chaque base, et la transaction annule ensemble les écritures métier et les notifications en cas d’échec.
