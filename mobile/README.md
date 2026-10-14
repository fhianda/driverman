# DriverMan mobile

Application Capacitor Android et iPhone pour les chauffeurs et les administrateurs. Le serveur PHP et sa base MySQL/MariaDB restent ceux de DriverMan. Le compte connecté détermine automatiquement les accès : gestion complète du parc pour l’administrateur, missions personnelles et GPS pour le chauffeur. Le téléphone de l’administrateur ne collecte pas les trajets des chauffeurs.

La version 1.7 place le formulaire de connexion avant l’image sur téléphone, masque les rubriques avant connexion et retire le lien technique du serveur. Le bouton de connexion est contrasté et le champ actif reste visible à l’ouverture du clavier. Le démarrage présente une icône animée et le logo TELESOL, sans attente artificielle. Android 12 et les versions suivantes utilisent aussi une animation native ; les versions précédentes affichent une image native puis l’animation de chargement web.

La version 1.6 affiche les rubriques directement sous l’en-tête sur téléphone après connexion, selon les droits du compte. La page web de téléchargement conserve uniquement le nom de l’application, la version, la taille et le bouton de téléchargement.

La version 1.5 retire les encarts techniques de l’accueil. Le chauffeur retrouve l’activation et l’arrêt du GPS dans **Menu → Suivi du trajet**, sans compteur de points ni journal de synchronisation sur ses pages. La collecte automatique et l’envoi des positions sont conservés.

Elle conserve la correction de la version 1.4 : l’espace des barres système et de l’encoche est réservé sur Android 15 et les versions suivantes. La version 1.7 complète les marges de Capacitor avec les insets du clavier dans `MainActivity`, sans les cumuler. Sur téléphone, le menu reste visible pendant le défilement et son bouton mesure 48 × 48 pixels CSS. Ne pas ajouter une seconde marge CSS fixe pour la barre système. Le livrable natif est l’[APK Android 1.7 de test](../downloads/DriverMan-Android-1.7.apk).

L’application comprend l’accès administrateur, les formulaires avec photos et le partage natif des rapports PDF et Excel. Elle conserve un point toutes les quinze secondes et le dernier point récent disponible au retour pour le chauffeur. Pour iPhone, la solution retenue est la PWA décrite ci-dessous. Les tests du suivi mobile sont simulés ; le GPS écran verrouillé doit encore être essayé sur un téléphone physique. Le projet natif iPhone est conservé pour une évolution future et n’a pas été compilé avec Xcode.

Transférer cet APK sur le téléphone puis l’ouvrir pour installer ou mettre à jour DriverMan. Android peut demander d’autoriser l’installation depuis l’application utilisée pour ouvrir le fichier. Se connecter avec le compte administrateur ou chauffeur existant. L’adresse du serveur est préconfigurée ; les anciennes installations conservent leur adresse enregistrée.

Le site propose aussi **Application Android · APK** sur la page de connexion et dans le menu connecté. La page `android.php` permet de télécharger l’APK. Après chaque compilation destinée au téléchargement, exécuter `npm run publish:android` à la racine et déployer le dossier `downloads/` avec le site. Le téléchargement de l’APK depuis le site ne déclenche pas son installation sans la confirmation de l’utilisateur sur Android.

## Configurer le serveur

1. Rendre l’installation DriverMan accessible depuis Internet avec un certificat HTTPS valide. `localhost` sur un téléphone désigne le téléphone ; enregistrer une adresse dans DriverMan ne publie pas le serveur Wamp.
2. Déployer le serveur DriverMan, notamment la version de `api.php` qui autorise les administrateurs mobiles, à l’adresse prévue : **https://driverman.trackkintrans.com/**.
3. Dans **Comptes & accès**, enregistrer cette adresse dans **Configuration du serveur mobile**. Les nouvelles installations utilisent déjà cette adresse ; les mises à jour conservent l’adresse enregistrée sur le téléphone. Aucun lien de configuration n’est affiché sous le formulaire de connexion.

L’API mobile utilise des jetons individuels expirant après 30 jours, stockés chiffrés sur le téléphone et hachés côté serveur. La déconnexion révoque le jeton ; un changement de mot de passe révoque les jetons du compte. Les requêtes mobiles nécessitent HTTPS. Un proxy doit transmettre correctement l’état HTTPS au serveur PHP.

## Compiler Android

Prérequis : Node.js 20 ou supérieur, JDK 21, Android SDK et accès aux dépôts Google/Maven. Depuis la racine du projet :

```powershell
npm --prefix mobile ci
npm --prefix mobile run sync
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\mobile\android\gradlew.bat -p mobile/android :app:assembleDebug
```

Configurer le SDK dans `android/local.properties` si nécessaire (`sdk.dir=...`, fichier local ignoré). L’APK de test se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`. Il est signé avec la clé de développement ; la distribution définitive nécessite une compilation release signée avec une clé conservée par l’exploitant. Une mise à jour de l’interface nécessite `npm run sync` avant de recompiler.

## Essai Android avec le serveur Wamp local

Un profil de compilation facultatif permet à l’émulateur de joindre la même installation et la même base que `http://localhost/driverman/`, via `https://127.0.0.1:9443/driverman/`. Le relais `local-server.mjs` écoute uniquement sur la boucle locale du PC et transmet les requêtes à Wamp sur le port 80. Il ne publie pas le serveur sur Internet.

Le certificat et sa clé privée sont conservés hors du dossier web, dans `%LOCALAPPDATA%\DriverMan\emulator-tls`. Le certificat local est valable 30 jours. Seul son certificat public est copié dans `android/app/build/generated/localHttps/res/raw/driverman_local_ca.pem`. Le profil `-PdrivermanLocalHttps=true` ajoute cette confiance uniquement pour `localhost` et `127.0.0.1` dans la variante debug ; les compilations habituelles et release ne l’utilisent pas.

Pour relancer la connexion sur ce poste, laisser Wamp démarré, lancer `node mobile/local-server.mjs` depuis la racine si le relais est arrêté, puis, après démarrage de l’émulateur :

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 reverse tcp:9443 tcp:9443
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 shell am start -n net.telesol.driverman/.MainActivity
```

L’adresse locale se saisit une fois dans l’APK de ce profil. Elle ne doit pas remplacer l’URL publique configurée par l’administrateur. Les connexions utilisent les vrais comptes et les enregistrements touchent la base Wamp existante.

## Installer sur iPhone : PWA

La PWA est la version choisie pour iPhone, sans Mac, Xcode ni compte Apple Developer. Après la mise en ligne du serveur :

1. Ouvrir **https://driverman.trackkintrans.com/** dans Safari.
2. Ouvrir **Partager** (dans **Plus** selon la version de Safari), puis **Sur l’écran d’accueil**.
3. Laisser **Ouvrir comme app web** activé si proposé, puis toucher **Ajouter**.
4. Ouvrir l’icône DriverMan et se connecter avec le compte administrateur ou chauffeur.

Les mêmes droits s’appliquent que sur le site. La consultation des trajets et le relevé ponctuel de position pour le carburant sont disponibles. La PWA n’enregistre pas automatiquement les itinéraires des courses et ne garantit pas de GPS écran verrouillé. Pour ce suivi, utiliser l’application Android native. [Instructions Safari d’Apple](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios).

## Projet natif iPhone : option future

Le projet Xcode est dans `ios/App`. Il reste disponible si une application native iPhone devient nécessaire. Copier le projet mobile ainsi que `assets/` et `index.php` à la racine sur un Mac disposant de Node.js 20 ou supérieur, Xcode et CocoaPods, puis lancer depuis la racine :

```bash
bash mobile/prepare-ios.sh
```

Ce script installe les dépendances verrouillées, compile l’interface, synchronise uniquement iOS et ouvre `ios/App/App.xcworkspace`. Dans Xcode, sélectionner la cible **App**, renseigner sa propre équipe dans **Signing & Capabilities**, puis tester sur un iPhone. L’identifiant est `net.telesol.driverman`, la version 1.2, build 3. Ne pas modifier cet identifiant après publication sans préparer la migration.

Pour distribuer aux utilisateurs via TestFlight, il faut un compte Apple Developer : créer la fiche dans App Store Connect, choisir **Product → Archive**, puis **Distribute App → App Store Connect**, et configurer les testeurs dans TestFlight. [Procédure Apple](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases). Aucun fichier IPA signé ni invitation TestFlight ne peut être produit avec le seul poste Windows actuel. Sans Mac ni compte Apple Developer, confier ce dossier à la personne qui assurera la compilation et la distribution ; le projet est préparé mais l’installation iPhone reste à faire.

Les descriptions françaises des autorisations GPS et photos, le mode de localisation en arrière-plan et le manifeste de confidentialité sont inclus. Vérifier les déclarations de confidentialité et les éléments graphiques avant une distribution en boutique. Dans l’intervalle, le site web peut être utilisé sur Safari iPhone après sa mise en ligne, mais il ne remplace pas la collecte GPS native écran verrouillé.

## Utiliser et vérifier le GPS

Activer **Suivi pendant mes courses**, autoriser la localisation précise et en arrière-plan, ainsi que les notifications Android. Le téléphone doit rester dans le véhicule. Le départ lance la collecte si le suivi est autorisé ; le retour conserve le dernier point reçu (récent et précis), synchronise les positions puis arrête la collecte. Une position trop ancienne, simulée ou trop imprécise n’est jamais utilisée comme point de retour. DriverMan conserve un premier point GPS valide, puis un point toutes les quinze secondes, y compris à l’arrêt, sans ouvrir UTM Geo Map. Si le signal est insuffisant à l’échéance, le prochain point précis est conservé dès qu’il est disponible. L’échéance reste mémorisée après synchronisation et redémarrage. La notification Android rend le suivi visible. Le bouton de désactivation permet de l’arrêter à tout moment.

Seuls des points récents d’une précision annoncée de 50 m ou mieux sont conservés. La file chiffrée, isolée par serveur et compte, garde jusqu’à 10 000 points en attente. En cas de saturation, la collecte s’arrête sans effacer les points conservés. Les envois sont idempotents ; une panne réseau n’efface pas les points. Une course déjà chargée peut continuer hors réseau, mais un nouveau départ et la confirmation du retour nécessitent le serveur. Un retour refusé pour panne réseau réactive la collecte.

Un téléphone forcé à arrêter l’application, éteint, privé d’autorisation ou soumis à certaines restrictions d’économie de batterie peut interrompre les relevés. Le suivi passif est préparé dans le code natif, mais sa continuité doit être validée sur les appareils utilisés. Le navigateur et la PWA ne remplacent pas cette application pour le suivi en arrière-plan.

Avant utilisation opérationnelle, réaliser sur Android puis iPhone :

- Une course réelle de plus de 10 minutes, avec écran verrouillé ; vérifier les points et leur précision au retour.
- Une portion sans réseau, suivie du rétablissement de la connexion ; vérifier l’absence de perte et de doublons.
- Un retour, une désactivation et une déconnexion ; vérifier l’arrêt du suivi.
- Un refus puis une réactivation de l’autorisation ; vérifier le message et la reprise.
- Un achat de carburant sur un lieu connu ; vérifier les coordonnées, la précision et le repère avant de l’enregistrer.
- L’affichage du tracé et le partage HTML/GPX/KML, puis l’import d’un tracé UTM Geo Map.

Les tests automatisés (`npm test` à la racine, `npm --prefix mobile test`) couvrent les règles métier, la file hors réseau et le cycle départ/retour simulé. Ils ne remplacent pas les essais de GPS et de verrouillage sur un téléphone physique.

## Alertes de l’administrateur

L’APK 1.3 contient le menu Notifications et les canaux son/vibreur/silencieux. Le projet Firebase n’est pas encore créé : la réception Android à distance reste désactivée. Suivre [le guide de configuration](../docs/notifications.md), ajouter google-services.json avant compilation et installer une nouvelle version. La PWA iPhone utilise Web Push et ne nécessite pas de compte Apple Developer.
