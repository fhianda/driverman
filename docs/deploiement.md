# Déployer DriverMan depuis GitHub

Le dépôt est `https://github.com/fhianda/driverman`, branche `main`. L'adresse prévue est `https://driverman.trackkintrans.com/`. Le dépôt conserve le code ; le serveur PHP et MySQL héberge l'application et ses données. Relier GitHub ne transfère pas la base de données.

## Vérifier le serveur avant la mise en ligne

- PHP 8.2 minimum, avec `pdo_mysql`, `mbstring`, cURL, OpenSSL, GD et Fileinfo. Vérifier les versions utilisées par le site et par la ligne de commande.
- MySQL 8.4 minimum pour le schéma et les requêtes actuels. Vérifier la version du **serveur** avec `SELECT VERSION();` dans phpMyAdmin ou le client SQL. La version du client `mysql` ne suffit pas. MariaDB nécessite une adaptation et des tests avant l'import ; ne pas importer le schéma actuel en supposant sa compatibilité.
- Composer pour installer les dépendances du fichier `composer.lock`, ou transférer un dossier `vendor/` préparé pour le serveur.
- HTTPS, un répertoire privé inscriptible hors du dossier public, et les tâches cron pour les reprises des notifications.

## Préparer le sous-domaine et le code

1. Dans l'hébergement, associer `driverman.trackkintrans.com` à son propre dossier public. Vérifier le dossier exact et son contenu avant tout transfert. Conserver une sauvegarde si un site existe déjà.
2. Vérifier les enregistrements DNS du sous-domaine et activer le certificat HTTPS.
3. Utiliser l'intégration Git du panneau, lorsqu'elle est disponible, ou SSH. Dans ce dernier cas, vérifier `git --version`, puis cloner le dépôt dans un dossier de préparation distinct et vide. Un dépôt privé nécessite un accès GitHub limité au dépôt concerné.
4. Installer les dépendances PHP avec `composer install --no-dev --prefer-dist --optimize-autoloader` dans ce dossier. Les assets web compilés sont déjà suivis dans Git, y compris `assets/vendor/` pour la carte et les rapports PDF/Excel ; `node_modules/` n'est pas à déployer. Le dossier PHP `vendor/` à la racine reste généré par Composer et interdit par HTTP.
5. Publier les fichiers PHP de la racine, `.htaccess`, `manifest.webmanifest`, `sw.js`, `offline.html`, et les dossiers `app/`, `assets/`, `downloads/`, `scripts/`, `vendor/`. Le dossier `scripts/` sert aux commandes CLI et doit rester interdit par HTTP, comme `app/` et `vendor/`. Ne pas publier `.git/`, `output/`, les tests, les sources mobiles ou les sauvegardes.

## Transférer les données

1. Sauvegarder la base locale `driverman` avec `mysqldump --single-transaction --hex-blob`. Utiliser une saisie interactive ou une configuration privée pour le mot de passe, et `--result-file` pour écrire le dump, notamment sous Windows. Conserver le fichier hors du dossier public et hors de Git.
2. Créer la base et un compte applicatif sur l'hébergement. Importer la sauvegarde avec un compte d'installation autorisé, puis utiliser un compte limité aux lectures et écritures de l'application. Le nom de la base distante peut comporter le préfixe imposé par l'hébergeur.
3. Créer `database.json` dans un répertoire privé hors de la racine web, avec les identifiants de la **base distante** et la structure décrite dans [mysql.md](mysql.md). Mettre `demo_prefix` à `null` si les bases de démonstration ne sont pas nécessaires ou autorisées.
4. Configurer `DRIVERMAN_DATA_DIR` avec le chemin absolu de ce répertoire, à la fois pour le PHP du site et pour les commandes CLI/cron. Ne pas reprendre le chemin Windows local sur le serveur Linux. Restreindre les droits du dossier et des fichiers au compte exécutant PHP et à l'administrateur.
5. Si l'application locale reste utilisée pendant le transfert, suspendre les écritures le temps de la sauvegarde finale et de la bascule, afin de ne pas perdre les opérations enregistrées entre les deux installations.

## Vérifier puis activer les mises à jour

Vérifier la connexion avec les comptes importés, les photos, les courses et les achats de carburant. Vérifier que les dossiers privés sont refusés par HTTP, que le certificat HTTPS est valide et que l'APK est téléchargeable. L'URL publique est déjà celle proposée par défaut dans l'application Android.

Configurer les notifications et la tâche cron conformément à [notifications.md](notifications.md). La configuration Firebase Android reste une étape distincte ; publier le site ne l'active pas automatiquement.

Après un premier déploiement validé, configurer les mises à jour depuis `main` dans le panneau ou avec un mécanisme SSH adapté. Déployer seulement le code ; conserver les configurations privées et la base sur le serveur. Une modification du schéma nécessite sa propre sauvegarde et procédure de migration.

Références : [déploiement Git Hostinger](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/), [connexion SSH Hostinger](https://www.hostinger.com/support/1583245-how-to-connect-to-a-hosting-plan-via-ssh-in-hostinger/).
