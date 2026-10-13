# Notifications des administrateurs

Dans **Notifications**, chaque administrateur choisit séparément **Départ d’une course** et **Achat de carburant** : désactivé, son, vibreur, son et vibration, ou silencieux. Cliquer sur **Enregistrer mes choix**, puis sur **Activer sur cet appareil** et accepter la permission système. Répéter l’activation sur chaque téléphone ou navigateur souhaité.

Les alertes commencent après activation des événements. Les 50 dernières sont consultables pendant 90 jours. Les administrateurs ont des préférences et des états de lecture indépendants. Un chauffeur ne peut ni s’abonner ni consulter ces alertes. La déconnexion retire la réception pour la session concernée ; les préférences du compte restent enregistrées.

## État de cette livraison

- Écran web et Android, préférences, historique, événements transactionnels et file d’envoi implémentés et testés avec des données isolées.
- Web Push standard préparé pour les navigateurs compatibles et la PWA iPhone ; clés créées dans le répertoire privé local.
- APK 1.3 préparé avec Firebase Cloud Messaging et quatre canaux Android. **Firebase n’est pas encore configuré** : cet APK ne reçoit donc pas encore les alertes Android à distance. Le bouton explique cette indisponibilité.
- Le fichier APK distribué ici est signé pour les essais, comme la version précédente. Prévoir une clé de signature de production conservée durablement avant une diffusion opérationnelle.
- Aucun envoi sur un téléphone réel, en arrière-plan ou écran verrouillé, n’a été validé. Aucune publication sur le domaine public n’a été effectuée dans cette modification.

## Déployer le serveur Web Push

1. Déployer le projet PHP, notamment `app/notifications.php`, `app/push.php`, `sw.js`, les nouveaux assets et `vendor/`, sur `https://driverman.trackkintrans.com/`. PHP **8.2 minimum**, extensions cURL, OpenSSL, mbstring et les extensions SQLite déjà nécessaires au projet. Installer les dépendances avec `composer install --no-dev --prefer-dist` si `vendor/` n’est pas transféré. Ne jamais désactiver la vérification TLS.
2. Utiliser le même `DRIVERMAN_DATA_DIR` privé que l’application. Le répertoire doit être hors de la racine web et accessible au processus PHP uniquement selon les droits nécessaires.
3. Exécuter une seule fois `php scripts/push-worker.php --init`. Cela crée `push.json` avec les clés VAPID privées. Sauvegarder ce fichier ; changer les clés oblige à réactiver les abonnements. Pour conserver des abonnements existants, transférer le fichier privé correspondant plutôt que générer de nouvelles clés.
4. Planifier toutes les minutes `php /chemin/driverman/scripts/push-worker.php` avec le même environnement et répertoire de données. Les événements tentent déjà un envoi après validation ; cette commande traite les reprises même sans visite du site. Le worker ne possède pas de route HTTP publique. Sur Windows, utiliser le Planificateur de tâches ; sur l’hébergement, une tâche cron PHP.
5. Vérifier le résultat du worker (`sent`, `failed`, `cancelled`) et l’accès HTTPS à l’API. Les erreurs de transport sont consignées dans `push_jobs.last_error` sans jetons ni clés. Les tentatives sont espacées, limitées à cinq et aux événements de moins d’une heure. Les jetons expirés sont retirés. Les appareils inscrits plus tard ne reçoivent pas d’ancien événement.

Sous Wamp, si OpenSSL ne trouve pas sa configuration, définir `OPENSSL_CONF` **avant le démarrage de PHP** (CLI ou service Apache), par exemple `C:\wamp64\bin\php\php8.4.15\extras\ssl\openssl.cnf`. Pour la CLI PowerShell :

```powershell
$env:OPENSSL_CONF='C:\wamp64\bin\php\php8.4.15\extras\ssl\openssl.cnf'
& 'C:\wamp64\bin\php\php8.4.15\php.exe' scripts/push-worker.php --init
```

## Activer Android avec Firebase

Cette étape nécessite un projet appartenant au propriétaire de DriverMan ; aucun compte externe n’a été créé automatiquement.

1. Dans la [console Firebase](https://console.firebase.google.com/), créer un projet, puis ajouter une application Android avec l’identifiant **`net.telesol.driverman`**. Google Analytics n’est pas nécessaire pour ces alertes.
2. Télécharger la configuration de l’application Android et placer `google-services.json` dans **`mobile/android/app/`**.
3. Activer l’API **Firebase Cloud Messaging API (HTTP v1)** du projet. Créer un compte de service autorisé à envoyer des messages FCM (rôle Firebase Cloud Messaging API Admin), télécharger sa clé JSON et la conserver dans un emplacement privé hors du site. Ne jamais copier cette clé dans l’APK, les assets ou le dossier de téléchargement.
4. Sur le serveur, exécuter `php scripts/configure-firebase.php /chemin/prive/compte-de-service.json`. Le script conserve les clés VAPID et enregistre uniquement les champs Firebase nécessaires dans le fichier privé `push.json`.
5. Augmenter `versionCode` et `versionName` dans `mobile/android/app/build.gradle`, puis exécuter `npm --prefix mobile run sync`, compiler l’APK signé et `npm run publish:android`. Une compilation contenant `google-services.json` active automatiquement l’option de réception Android. Utiliser le **même projet Firebase** pour l’APK et le serveur.
6. Installer la nouvelle version, se connecter comme administrateur et activer cet appareil dans **Notifications**. Autoriser les notifications sur Android. Les quatre canaux peuvent aussi être réglés dans les paramètres système de DriverMan.

Les messages FCM contiennent une notification visible : Android peut l’afficher lorsque la WebView est fermée, sans maintenir le GPS ni un service de surveillance actif pour l’administrateur. Les réglages système, le réseau, les restrictions du constructeur et un arrêt forcé peuvent empêcher la réception. Android 15 n’affiche pas les notifications d’un espace privé verrouillé.

## iPhone et navigateur

Sur iPhone, installer la PWA depuis Safari sur l’écran d’accueil (**iOS 16.4 ou ultérieur**), l’ouvrir, se connecter et cliquer sur **Activer sur cet appareil**. Ni Mac ni compte Apple Developer ne sont nécessaires pour Web Push. L’application doit être servie en HTTPS.

Le système décide du son et de la vibration des notifications web. L’application transmet le mode silencieux et la demande de vibration quand ces options sont prises en charge ; elle ne peut pas garantir un son seul ou un vibreur seul sur tous les navigateurs et sur iPhone. Android natif utilise les canaux séparés pour ces modes. Aucun réglage de DriverMan ne contourne le mode Ne pas déranger.

## Validation avant mise en service

- Activer les deux événements sur un administrateur, un seul sur un autre ; vérifier la séparation des choix.
- Depuis un compte chauffeur, enregistrer un départ puis un achat réels de test. Vérifier une alerte par enregistrement, le titre, le montant et la destination ouverte au toucher.
- Tester application ouverte, fermée normalement, puis écran verrouillé sur un Android avec Google Play Services et sur une PWA iPhone installée.
- Vérifier les quatre modes Android et les restrictions système, puis désactiver un événement et la réception sur l’appareil.
- Se déconnecter et vérifier qu’un nouveau départ n’envoie plus d’alerte sur cet appareil. Une alerte déjà remise au fournisseur avant la déconnexion peut encore arriver.
- Simuler une panne du fournisseur et vérifier une reprise par le worker. Aucune clé ou jeton ne doit être écrit dans les journaux.

Références : [Capacitor Push Notifications v7](https://capacitorjs.com/docs/v7/apis/push-notifications), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Web Push sur iPhone](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
