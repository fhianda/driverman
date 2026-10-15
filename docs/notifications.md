# Notifications des administrateurs

Les départs de course et les achats de carburant créent automatiquement une alerte pour chaque administrateur, dans la transaction métier. Les anciennes préférences « désactivé » ne les bloquent plus. La page **Notifications** contient l’historique et le marquage de lecture, sans formulaire de préférences ni bouton d’activation.

Depuis la version 1.13, ouvrir la cloche marque les alertes affichées dans la liste comme lues. Toucher une alerte Android ou Web Push marque uniquement cette alerte comme lue et ouvre sa rubrique. La lecture est enregistrée côté serveur pour le compte connecté, conservée après actualisation et isolée des autres administrateurs. Le compteur ne diminue qu’après confirmation serveur ; un échec réseau est signalé. **Tout marquer comme lu** reste disponible pour les alertes plus anciennes que les 50 affichées.

La réception Android s’inscrit automatiquement après connexion administrateur et demande une seule fois l’autorisation système si nécessaire. Sur le web/PWA, une autorisation déjà accordée est réutilisée ; sinon la première interaction après connexion déclenche la demande du navigateur. Aucun refus n’est contourné. Les appareils inscrits après un événement ne reçoivent pas de notification rétroactive. Les 50 dernières alertes sont consultables pendant 90 jours ; la lecture reste propre à chaque compte et la déconnexion retire la réception de cette session.

## État de cette livraison

- Historique web et Android, inscription automatique, événements transactionnels et file d’envoi testés avec des données isolées.
- Web Push standard configuré sur Hostinger pour les navigateurs compatibles et la PWA iPhone ; les clés VAPID restent dans le répertoire privé du serveur.
- APK 1.12 (versionCode 13) compilé avec Firebase `driverman-d5cbd`. Le canal son et vibration est utilisé pour les alertes automatiques, dans les limites des réglages Android.
- Le 14 octobre 2026, Hostinger a validé l’authentification du compte technique et une requête FCM HTTP v1 `validate_only`, sans envoi à un téléphone. Le worker a confirmé `web: true`, `android: true`, `firebase_validated: true` et une file sans erreur. Il s’exécute toutes les minutes.
- Le fichier APK distribué ici est signé pour les essais, comme la version précédente. Prévoir une clé de signature de production conservée durablement avant une diffusion opérationnelle.
- Aucun envoi sur un téléphone réel, en arrière-plan ou écran verrouillé, n’a encore été validé. La validation serveur ne remplace pas cet essai après installation et autorisation des notifications.

## Déployer le serveur Web Push

1. Déployer le projet PHP, notamment `app/notifications.php`, `app/push.php`, `sw.js`, les nouveaux assets et `vendor/`, sur `https://driverman.trackkintrans.com/`. PHP **8.2 minimum**, extensions cURL, OpenSSL, mbstring et `pdo_mysql` pour la base MySQL du projet. Installer les dépendances avec `composer install --no-dev --prefer-dist` si `vendor/` n’est pas transféré. Ne jamais désactiver la vérification TLS.
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

Le projet **DriverMan** (`driverman-d5cbd`, numéro `58103862399`) est actif. L’application Android `net.telesol.driverman` y est enregistrée avec l’identifiant `1:58103862399:android:f8fa4509ec353e8e2bdb4a`. Sa configuration `google-services.json` est intégrée à la compilation 1.8 et ignorée par Git. Console : https://console.firebase.google.com/project/driverman-d5cbd/overview

L’API FCM HTTP v1 est activée. Le compte `driverman-notifications@driverman-d5cbd.iam.gserviceaccount.com` possède le rôle `roles/firebasecloudmessaging.admin` pour l’envoi. La clé privée du compte technique est conservée hors du site public et n’est incluse ni dans l’APK ni dans GitHub. Les étapes suivantes servent à reproduire la configuration ou à renouveler la clé :

1. Dans la [console du projet DriverMan](https://console.firebase.google.com/project/driverman-d5cbd/overview), terminer l’activation Firebase si nécessaire, puis ajouter une application Android avec l’identifiant **`net.telesol.driverman`**. Google Analytics n’est pas nécessaire pour ces alertes.
2. Télécharger la configuration de l’application Android et placer `google-services.json` dans **`mobile/android/app/`**.
3. Activer l’API **Firebase Cloud Messaging API (HTTP v1)** du projet. Créer un compte de service autorisé à envoyer des messages FCM (rôle Firebase Cloud Messaging API Admin), télécharger sa clé JSON et la conserver dans un emplacement privé hors du site. Ne jamais copier cette clé dans l’APK, les assets ou le dossier de téléchargement.
4. Sur le serveur, exécuter `php scripts/configure-firebase.php /chemin/prive/compte-de-service.json`. Le script conserve les clés VAPID et enregistre uniquement les champs Firebase nécessaires dans le fichier privé `push.json`.
5. Augmenter `versionCode` et `versionName` dans `mobile/android/app/build.gradle`, puis exécuter `npm --prefix mobile run sync`, compiler l’APK signé et `npm run publish:android`. Une compilation contenant `google-services.json` active automatiquement l’option de réception Android. Utiliser le **même projet Firebase** pour l’APK et le serveur.
6. Installer la nouvelle version et se connecter comme administrateur. Accepter la demande système de notification ; l’inscription est automatique.

Les messages FCM contiennent une notification visible : Android peut l’afficher lorsque la WebView est fermée, sans maintenir le GPS ni un service de surveillance actif pour l’administrateur. Les réglages système, le réseau, les restrictions du constructeur et un arrêt forcé peuvent empêcher la réception. Android 15 n’affiche pas les notifications d’un espace privé verrouillé.

## Installation Hostinger actuelle

L’application publique est dans `/home/u535341568/domains/trackkintrans.com/public_html/driverman`. Ses configurations privées `database.json` et `push.json` sont dans `/home/u535341568/driverman-data`, hors de la racine web.

Le lanceur `scripts/hostinger-push-worker.php` est installé dans `/home/u535341568/domains/trackkintrans.com/driverman-private/hostinger-push-worker.php`, également hors de `public_html`. La tâche cron personnalisée, toutes les minutes (`* * * * *`), utilise :

```sh
/usr/bin/env DRIVERMAN_APP_DIR=/home/u535341568/domains/trackkintrans.com/public_html/driverman DRIVERMAN_DATA_DIR=/home/u535341568/driverman-data /usr/bin/php /home/u535341568/domains/trackkintrans.com/driverman-private/hostinger-push-worker.php
```

Le préfixe `/usr/bin/env` est nécessaire avec le lanceur Hostinger. Le script conserve les clés VAPID existantes, verrouille les exécutions concurrentes et traite les reprises même sans visite du site. Pour importer une clé renouvelée du même compte, déposer `driverman-notifications-service-account.json` à côté du lanceur privé : il vérifie le projet et le compte, l’intègre à `push.json` avec des droits 0600, puis supprime la copie de transfert. Le dossier du lanceur reçoit les droits 0700. Une validation FCM sans envoi est exécutée à chaque changement de clé.

Le fichier privé `status.json` et la sortie cron ne contiennent que les capacités, la validation Firebase, les compteurs de la file et des codes d’erreur sans secrets. Le marqueur `.firebase-verified` contient uniquement une empreinte de la clé. Conserver une sauvegarde privée de `push.json` et de la clé du compte ; ne jamais les publier via le gestionnaire de fichiers ou Git.

## iPhone et navigateur

Sur iPhone, installer la PWA depuis Safari sur l’écran d’accueil (**iOS 16.4 ou ultérieur**), l’ouvrir et se connecter. La première interaction dans l’application demande l’autorisation système. Une demande ignorée peut être relancée en touchant la cloche. Ni Mac ni compte Apple Developer ne sont nécessaires pour Web Push. HTTPS est obligatoire.

Le système décide du son et de la vibration des notifications web. L’application transmet le mode silencieux et la demande de vibration quand ces options sont prises en charge ; elle ne peut pas garantir un son seul ou un vibreur seul sur tous les navigateurs et sur iPhone. Android natif utilise les canaux séparés pour ces modes. Aucun réglage de DriverMan ne contourne le mode Ne pas déranger.

## Validation avant mise en service

- Connecter deux administrateurs sans préférences : les deux doivent recevoir départs et achats ; vérifier la séparation de la lecture.
- Depuis un compte chauffeur, enregistrer un départ puis un achat réels de test. Vérifier une alerte par enregistrement, le titre, le montant et la destination ouverte au toucher.
- Tester application ouverte, fermée normalement, puis écran verrouillé sur un Android avec Google Play Services et sur une PWA iPhone installée.
- Vérifier le son et la vibration selon les réglages système ; refuser la permission puis vérifier que l’historique reste accessible sans demande répétée.
- Se déconnecter et vérifier qu’un nouveau départ n’envoie plus d’alerte sur cet appareil. Une alerte déjà remise au fournisseur avant la déconnexion peut encore arriver.
- Simuler une panne du fournisseur et vérifier une reprise par le worker. Aucune clé ou jeton ne doit être écrit dans les journaux.

Références : [Capacitor Push Notifications v7](https://capacitorjs.com/docs/v7/apis/push-notifications), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Web Push sur iPhone](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
