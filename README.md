# DriverMan TELESOL

Application en français de gestion des chauffeurs, véhicules et mouvements, conçue pour Wamp. Interface responsive avec **Tailwind CSS 4, daisyUI 5 et Alpine.js 3 (version CSP)**. Serveur PHP et base MySQL persistante.

## Démarrer

Pour la mise en ligne sur `driverman.trackkintrans.com` depuis GitHub, voir [le guide de déploiement](docs/deploiement.md).

Pour repartir avec un parc vide : **Comptes & accès → Nouvelle utilisation → Préparer la remise à zéro**. Après le retour de toutes les courses en cours, l’administrateur saisit son mot de passe et `REINITIALISER`, puis confirme **Effacer et recommencer**. Seuls les comptes administrateurs, leurs réglages de notifications et la configuration du serveur restent en place. Chauffeurs, comptes chauffeurs, véhicules, photos, courses, achats, tracés et historique des notifications sont supprimés. Aucun identifiant technique n’est réutilisé, afin que les anciennes files GPS ne puissent pas se rattacher aux nouvelles courses.

Une sauvegarde SQL complète des données supprimées est écrite avant l’effacement dans `DRIVERMAN_DATA_DIR/reset-backups`, hors du site public. Si sa création échoue, rien n’est supprimé. Elle est téléchargeable après l’opération et via **Télécharger la dernière sauvegarde** dans la même fenêtre. Conserver ce fichier en lieu sûr : il contient les données du parc et les empreintes de mots de passe des anciens chauffeurs. Pour restaurer, un administrateur de la base importe ce SQL dans un espace vide ayant le même schéma et les administrateurs d’origine ; ne pas l’importer par-dessus un nouveau parc déjà rempli. Les sessions et les envois push ne sont pas restaurés. Les tests d’intégration vérifient le cycle effacement/restauration, y compris les photos binaires.

1. Démarrer Apache dans Wamp.
2. Ouvrir **http://localhost/driverman/**.
3. Se connecter avec un compte administrateur. Sur cette installation, les accès initiaux `admin@telesol.net` et `chauffeur@telesol.net` ont été créés à la demande du propriétaire. Leurs mots de passe distincts sont conservés dans **`C:\wamp64\driverman-data\acces-initiaux.txt`**, en dehors du dossier web et du code source.
4. Ajouter les chauffeurs et les véhicules, puis enregistrer les départs et les retours.

La fiche initiale **Chauffeur TELESOL** est indisponible et doit être complétée avec le nom, le téléphone, le numéro et la validité du permis avant une affectation. Aucune information de permis n’a été inventée. Les adresses de connexion ne créent pas de boîtes e-mail.

La page de connexion adopte une composition automobile sombre : barre latérale, photographies en couleur, titre incliné et formulaire épuré. Les liens latéraux choisissent la rubrique à afficher après connexion, selon les autorisations du compte. Aucun bouton de démonstration n’est affiché. Sur une nouvelle installation sans utilisateurs, le formulaire propose directement la création du premier administrateur, uniquement depuis l’ordinateur qui héberge le serveur.

Les fenêtres de formulaire sont centrées dans l’écran, avec défilement interne sur petit écran et animation d’ouverture douce. Les animations respectent la préférence système de réduction des mouvements.

L’espace connecté reprend la même identité que l’accueil : surfaces anthracite, photos en couleur, titres inclinés, logo blanc et touches orange. Il occupe toute la largeur et la hauteur disponibles dans le navigateur, sans cadre gris extérieur. Ce thème couvre le tableau de bord, les véhicules, les chauffeurs, les mouvements, les comptes et tous les formulaires. Les couleurs des statuts restent distinctes et les listes conservent leur défilement horizontal sur mobile.

Les chauffeurs et les véhicules sont présentés en cartes dans `assets/cards.css`. Chaque carte chauffeur affiche un petit avatar rond, les coordonnées, la validité du permis, le compte d’accès et les missions enregistrées. Chaque carte véhicule affiche sa photo, la plaque, l’énergie, le compteur et l’éventuelle mission en cours. Sans photo, un pictogramme de personne ou de véhicule apparaît. Les statistiques proviennent des mouvements enregistrés. Recherche, filtres et modification restent disponibles.

Dans **Ajouter** ou **Modifier**, choisir une photo JPG, PNG ou WebP de **2 Mo maximum** (12 mégapixels et 6 000 pixels par côté maximum). L’aperçu apparaît avant l’enregistrement ; **Retirer la photo** prend effet à l’enregistrement de la fiche. Le bouton photo sur une carte véhicule ouvre directement sa fiche. Le serveur vérifie le contenu, corrige l’orientation EXIF si disponible et convertit les photos en JPEG sans métadonnées, avec un côté maximal de 512 pixels pour les avatars et 1 600 pixels pour les véhicules. Les photos sont enregistrées dans MySQL et servies uniquement aux comptes autorisés ; une sauvegarde de la base les inclut.

Le champ **Type de véhicule** propose les catégories habituelles et accepte un nouveau libellé. Après enregistrement, ce type devient une suggestion pour les véhicules suivants tant qu’il est utilisé dans le parc.

L’avatar en haut à droite ouvre le menu du compte : **Mon profil**, **Changer le mot de passe**, **Guide d’utilisation** et **Se déconnecter**. Le profil présente l’identité, l’adresse de connexion et le rôle. Le changement du mot de passe demande le mot de passe actuel et confirme le nouveau ; il est indisponible en démonstration. Le menu se ferme au clic extérieur, avec Échap ou en quittant ses commandes au clavier.

Chaque fiche chauffeur ou véhicule propose **Supprimer** aux administrateurs, avec confirmation. Une mission en cours bloque la suppression jusqu’au retour. Les fiches sont retirées du parc par suppression logique ; leurs mouvements et ravitaillements restent consultables. Le compte lié à un chauffeur supprimé perd immédiatement son accès, y compris dans ses sessions existantes. Les photos sont retirées. Les plaques, permis et adresses de compte restent réservés aux enregistrements conservés ; aucune restauration n’est proposée dans l’interface.

Dans **Chauffeurs** et **Comptes & accès**, l’administrateur peut aussi **Suspendre** puis **Réactiver** un chauffeur. La suspension bloque la connexion web/Android et les nouveaux départs, tout en conservant sa fiche, son historique et sa disponibilité. Elle nécessite de terminer sa course en cours. La réactivation exige une nouvelle connexion, même pour une ancienne session restée hors ligne ; elle ne rend pas disponible un chauffeur marqué indisponible. La suppression est également accessible depuis son compte. Aucun de ces boutons ne cible les administrateurs.

Les politiques d’accès sont stockées dans `app_settings` sous `driver_access:<id>`, avec une révision de session. Chaque suspension/réactivation révoque les jetons mobiles et les appareils push associés. Les écritures métier et les connexions sont sérialisées avec ces changements d’accès. Les politiques sont incluses dans la sauvegarde de remise à zéro, puis effacées avec les chauffeurs. Aucune migration de schéma n’est nécessaire.

## Carburant et indicateurs

Les administrateurs enregistrent les ravitaillements depuis **Carburant** ou directement sur une carte véhicule. Les chauffeurs disposent de **Acheter du carburant** dans **Mon espace** et **Mon carburant**, pour un véhicule disponible ou celui de leur mission en cours, y compris avant leur première course. La saisie comprend : date et heure locales, compteur, litres, prix unitaire, devise **USD ou CDF**, plein complet ou partiel, station et observations. Les quantités et prix acceptent trois décimales ; le total de chaque ravitaillement est arrondi à deux décimales. Les montants des deux devises ne sont jamais additionnés ni convertis. Les véhicules électriques sont exclus de la saisie en litres.

Le chauffeur consulte uniquement les achats enregistrés avec son compte, leurs quantités et dépenses, ainsi que les kilomètres de ses missions. L’administrateur retrouve tous les achats dans le suivi du parc. La consommation entre pleins reste dans l’espace administrateur, car son calcul nécessite aussi les ravitaillements des autres comptes pour le même véhicule.

**Utiliser ma position actuelle** demande directement la localisation de l’appareil et remplit la latitude et la longitude dès le premier relevé récent. DriverMan demande la haute précision, puis conserve le meilleur relevé reçu pendant 30 secondes maximum ; un point à 20 m ou mieux termine la recherche immédiatement. **Conserver cette position** arrête la recherche et garde les coordonnées affichées. Une position au-delà de 50 m est indiquée comme approximative et reste enregistrable avec la précision réellement annoncée par l’appareil. Aucune précision exacte n’est garantie. Le GPS natif est utilisé sur mobile ; le navigateur nécessite HTTPS ou localhost et l’autorisation de localisation. Aucun passage par Google Maps ou UTM Geo Map n’est nécessaire. La consultation de la carte reste facultative. Les coordonnées peuvent être saisies manuellement ou laissées vides. Pour un ravitaillement ancien, saisir celles du lieu concerné ; les anciennes positions ne sont pas modifiées. Cette tolérance concerne le lieu du ravitaillement : les règles du suivi des courses restent inchangées.

Le tableau de bord et la rubrique Carburant proposent des filtres par véhicule, période et indicateur : litres ajoutés, litres consommés entre pleins, kilomètres des trajets terminés, dépenses par devise et consommation moyenne en L/100 km. Le sélecteur **Regrouper**, en haut à droite du graphique, permet de choisir **Par jour**, **Par semaine**, **Par mois** ou **Par année**. Les semaines vont du lundi au dimanche, y compris au changement d’année. Les dates **Du / Au**, le véhicule et la devise restent appliqués ; le regroupement modifie les barres et le tableau des valeurs, sans changer les totaux. Le mode **Auto** conserve le passage automatique du jour au mois pour les longues périodes. Les périodes vides restent visibles avec zéro ou une consommation indéterminée. Les quatre indicateurs de l’espace chauffeur s’affichent sur quatre colonnes sur grand écran, puis deux ou une selon la largeur. Les véhicules retirés du parc restent sélectionnables pour leur historique.

La valeur de chaque barre est affichée au-dessus, avec des décimales adaptées à l’indicateur. L’espacement conserve la lisibilité des nombres ; le graphique peut défiler horizontalement lorsque la période comporte beaucoup de valeurs.

Le tableau de bord administrateur présente uniquement les cartes d’indicateurs en haut, le graphique avec ses filtres au milieu, puis les cinq derniers mouvements et les cinq derniers ravitaillements en bas. Les mouvements sont classés par date du dernier départ ou retour. Les filtres actualisent le graphique et les cartes carburant ; les deux listes du bas conservent les derniers enregistrements de l’ensemble du parc. Le grand bandeau illustré et les anciens panneaux secondaires n’y sont plus affichés.

Les litres ravitaillés ne mesurent pas à eux seuls la consommation. Le calcul **plein à plein** additionne les ajouts après un premier plein complet jusqu’au plein complet suivant, puis divise par la différence des compteurs. Le premier plein n’entre pas dans la quantité consommée ; les ajouts partiels intermédiaires sont inclus. Sans deux pleins complets à des kilométrages distincts, la consommation reste indéterminée. La moyenne du parc est pondérée par les distances. Chaque intervalle est rattaché au jour du plein final : le total filtré n’est donc pas une mesure exacte du carburant brûlé durant les seules dates affichées. Les pleins manquants ou mal déclarés faussent cette estimation.

Les compteurs sont contrôlés par rapport aux ravitaillements et mouvements antérieurs et postérieurs. Une saisie antidatée ne diminue jamais le compteur du véhicule ; un retour de mission ne peut pas précéder un ravitaillement enregistré pendant la mission ni abaisser le compteur. Les données sont conservées dans MySQL et incluses dans sa sauvegarde.

## Rapports et exports

La rubrique **Rapports**, réservée aux administrateurs, propose un **rapport complet**, un **rapport des courses** ou un **rapport carburant**. Choisir le mois de début, le mois de fin et, éventuellement, un véhicule. Par défaut, la période couvre janvier jusqu’au mois en cours. Les véhicules retirés restent accessibles dans l’historique.

Les tableaux présentent les courses par mois, par véhicule et par chauffeur, les courses terminées ou encore en cours, leur distance, les ravitaillements, les litres ajoutés, les dépenses USD et CDF et la consommation estimée. Une course est comptée dans le mois de son **départ**. Sa distance est incluse seulement si elle est terminée ; son statut correspond à l’état lors de la génération, même si le retour a eu lieu après la période. Les mouvements du tableau de bord, eux, rattachent les kilomètres au retour : ces deux présentations répondent à des questions différentes.

**Exporter en PDF** télécharge un document A4 paysage avec synthèse, tableaux, détail des courses ou ravitaillements, explication des calculs et pages numérotées. **Exporter en Excel** télécharge un véritable fichier `.xlsx` avec onglets, colonnes numériques, dates triables, filtres et en-têtes figés. Les exports contiennent tous les enregistrements correspondant aux filtres et rechargent les données autorisées avant génération. Les textes saisis restent des cellules texte Excel, même lorsqu’ils commencent par `=`. Une période vide produit un rapport explicitement vide, avec des zéros et une consommation indéterminée.

Les bibliothèques jsPDF, AutoTable et ExcelJS sont distribuées dans `assets/vendor/` avec leurs licences ; aucune connexion à un service externe n’est nécessaire pour générer les fichiers. Elles se chargent uniquement au premier export du format demandé.

## Installation PWA

Le lien **Application Android · APK** est disponible sur la page de connexion et dans le menu de l’espace connecté, pour les administrateurs et les chauffeurs. Il ouvre `android.php`, avec la version disponible, la taille du fichier, le téléchargement et les étapes d’installation. L’accès au téléchargement ne nécessite pas de connexion. Le téléphone demande lui-même la confirmation d’installation.

L’APK public et ses informations se trouvent dans `downloads/`. Après avoir compilé une nouvelle version Android (`versionCode` et `versionName` augmentés), lancer **`npm run publish:android`** à la racine. La commande copie l’APK compilé et actualise `downloads/android.json` ; elle refuse de remplacer une version existante par un fichier différent. Elle ne publie rien sur Internet. Lors du déploiement du site, inclure **`android.php`, `assets/android.css`, les fichiers PWA modifiés et tout le dossier `downloads/` avec son `.htaccess`**. Le répertoire `output/` ne sert pas à la distribution web. La version disponible actuellement est l’APK de test 1.2.

À la première visite sur cet appareil et ce navigateur, une invitation propose **Installer l’application** ou **Plus tard**. Elle n’apparaît plus automatiquement après avoir été vue. Le bouton **Installer l’application** reste disponible dans la barre latérale, sur l’accueil et dans l’espace connecté. Il affiche **Installé** lorsque le navigateur signale une installation ou lorsque DriverMan est ouvert en mode application.

Chrome et Edge compatibles proposent leur fenêtre native après un clic sur Installer. **Sur iPhone, la PWA est la version retenue**, sans Mac ni compte Apple Developer. Après publication du serveur, ouvrir **https://driverman.trackkintrans.com/** dans Safari, puis **Partager → Sur l’écran d’accueil → Ajouter**, avec **Ouvrir comme app web** activé si proposé. Les comptes administrateur et chauffeur y conservent leurs droits. L’invitation affiche les étapes Safari et un bouton **Compris**, sans prétendre installer automatiquement l’application. Sur iPhone/iPad, l’état **Installé** est confirmé seulement lorsque l’application est ouverte depuis son icône ; Safari permet toujours de retrouver les instructions. Les autres navigateurs utilisent leur détection native et le dernier état connu.

La PWA nécessite **HTTPS**, ou **localhost / 127.0.0.1** sur le poste serveur. Une adresse IP du réseau local en HTTP ne permet pas l’installation native. Le manifeste utilise des chemins relatifs pour fonctionner dans le dossier `driverman/` ou une autre racine. Le serveur Wamp doit rester accessible pour gérer le parc. Le service worker conserve seulement une page hors connexion et des icônes publiques ; il ne met en cache ni les API, ni les écrans connectés, ni les photos ou rapports privés. Le cache est isolé par chemin d’installation.

La PWA permet de consulter les itinéraires reçus et de relever ponctuellement la position lors d’un ravitaillement. Elle ne collecte pas automatiquement les itinéraires et ne garantit pas le GPS écran verrouillé. Utiliser l’application Android native pour ce suivi.

## Rôles et comptes

| Action | Administrateur | Chauffeur |
| --- | --- | --- |
| Ajouter et modifier des chauffeurs | Oui | Non |
| Suspendre, réactiver et supprimer des chauffeurs | Oui | Non |
| Ajouter et modifier des véhicules | Oui | Non |
| Créer d’autres comptes administrateurs | Oui | Non |
| Créer les accès des chauffeurs | Oui | Non |
| Affecter un chauffeur et un véhicule à un départ | Oui | Non |
| Créer une course à son nom avec un véhicule disponible | Oui | Oui |
| Enregistrer un achat de carburant | Tous les véhicules thermiques ou hybrides | Véhicule disponible ou de sa mission en cours |
| Consulter les achats de carburant | Ensemble du parc | Ses propres saisies |
| Consulter la liste des véhicules et leurs photos | Oui | Oui, en consultation seule |
| Consulter l’ensemble des mouvements | Oui | Non |
| Consulter ses propres missions et son historique | Oui | Oui |
| Confirmer un retour | Toutes les missions | Ses propres missions |
| Exporter les mouvements en CSV | Ensemble du parc | Ses propres trajets |
| Consulter les rapports et exporter en PDF / Excel | Oui | Non |
| Installer l’application PWA | Oui | Oui |

Dans **Comptes & accès**, cliquer sur **Créer un compte**, choisir le rôle et saisir les identifiants. Pour un chauffeur, associer le compte à sa fiche existante. Le bouton **Créer son compte** sur une fiche chauffeur préremplit cette association. Une seule connexion personnelle peut être associée à chaque chauffeur. Les administrateurs disposent des mêmes droits de gestion.

Les permissions sont contrôlées par l’API. Les réponses envoyées à un chauffeur ne contiennent pas les missions, comptes ou fiches des autres chauffeurs. Les mots de passe sont hachés ; ils ne sont jamais renvoyés dans les listes de comptes. Les sessions utilisent des cookies HttpOnly et SameSite, avec des jetons CSRF pour les écritures.

La rubrique **Véhicules** est accessible aux chauffeurs dès leur première connexion, même sans mission. Elle affiche tous les véhicules présents dans le parc, leurs photos, plaques, catégories, énergies, compteurs et disponibilités, avec recherche et filtres. Un véhicule utilisé par un autre chauffeur apparaît « En déplacement » sans révéler sa mission. Le nombre de trajets affiché au chauffeur correspond à ses propres courses. L’ajout, la modification, le changement de photo et la suppression restent réservés aux administrateurs.

Le bouton **Créer une course**, dans **Mon espace** et **Mes missions**, associe automatiquement le départ au chauffeur connecté. Il choisit un véhicule disponible, la destination, le motif, la date et le compteur. Les contrôles de disponibilité, de permis et de kilométrage s’appliquent aussi aux départs créés par un chauffeur. La liste de choix véhicule fournit uniquement les informations nécessaires à la saisie, sans révéler les missions des autres chauffeurs.

## Fonctionnement

- Recherche et filtres sur les chauffeurs, véhicules, mouvements et comptes.
- Immatriculations, permis et adresses e-mail uniques.
- Départs réservés aux véhicules et chauffeurs disponibles ; permis valide obligatoire.
- Retour prévu facultatif au départ : sans horaire prévisionnel, le mouvement reste « En cours » sans alerte de retard. La date, l’heure et le kilométrage du retour réel sont obligatoires pour clôturer le mouvement.
- Réservations atomiques : un véhicule ou chauffeur ne peut avoir deux missions simultanées.
- Kilométrages et chronologie contrôlés au départ et au retour.
- Retour : mise à jour du compteur et libération immédiate du chauffeur et du véhicule.
- Historique conservé, compteurs et disponibilités calculés à partir des mouvements.
- Export CSV compatible Excel, avec neutralisation des formules dans les valeurs textuelles.
- Guide d’utilisation intégré.

## GPS réel, UTM Geo Map et carte de l’itinéraire

Dans **Mouvements / Mes missions**, le bouton de localisation ouvre **Itinéraire de la course**. Il est également accessible depuis les détails d’un mouvement. La carte utilise les positions effectivement reçues du téléphone ou les tracés importés ; aucun itinéraire ancien n’est inventé à partir du compteur ou de la destination.

### Suivi passif sur le téléphone

Le projet `mobile/` contient l’application native Android/iPhone. Avec le compte chauffeur, choisir une fois **Activer le suivi pendant mes courses**, autoriser la position précise et la localisation en arrière-plan (et les notifications sur Android), puis enregistrer un départ. **DriverMan utilise directement le GPS du téléphone : il n’est pas nécessaire d’ouvrir UTM Geo Map.** L’autorisation du suivi est mémorisée pour les courses suivantes. Le téléphone doit rester dans le véhicule.

À partir de la version Android 1.1, un premier point précis est enregistré au départ, puis un nouveau relevé est conservé toutes les **15 secondes**, même si le véhicule ne bouge pas. Cette cadence est mémorisée avec les points dans le stockage chiffré : la synchronisation, une reconnexion ou un redémarrage n’ajoutent pas de positions intermédiaires. Le panneau mobile indique le dernier relevé et la prochaine échéance. Si le GPS est indisponible ou imprécis à l’échéance, le premier point récent et suffisamment précis reçu ensuite est retenu ; aucune position n’est inventée.

Les événements GPS proviennent du service natif en arrière-plan, sans minuteur de page web et sans filtre de déplacement. L’enregistrement courant est limité à un point toutes les quinze secondes ; au retour, le dernier point reçu est aussi conservé s’il est récent, précis et distinct du précédent. Le système de localisation peut produire des relevés plus fréquents en interne. Les relevés continuent écran verrouillé tant que le système laisse fonctionner l’application. Un arrêt forcé ou une restriction d’économie de batterie peut interrompre le suivi ; la disponibilité du signal et le système mobile peuvent retarder une échéance. La PWA et la page web ne garantissent pas cette collecte en arrière-plan.

Les relevés récents d’une précision maximale de 50 m sont conservés dans une file locale chiffrée, puis synchronisés avec la course. Une panne réseau ne supprime pas les points. La file est isolée par serveur et compte, limitée à 10 000 positions en attente ; une saturation arrête la collecte avec un message sans supprimer les anciens points. Le serveur accepte jusqu’à 100 000 relevés par course. Le retour synchronise les points en attente et arrête le GPS ; sans serveur, la confirmation du retour échoue et la collecte reprend. Les points relevés pendant la course restent synchronisables après un retour enregistré par l’administrateur.

L’application Android 1.2 est préconfigurée pour **https://driverman.trackkintrans.com/**. Elle accepte les comptes administrateur et chauffeur : le serveur détermine les droits et le GPS de course est réservé au chauffeur concerné. Les formulaires avec photos, les rapports PDF/Excel et les exports de trajets sont utilisables sur mobile. Une ancienne installation conserve son serveur ; il se modifie après déconnexion. Le domaine doit héberger la version actuelle du serveur PHP, y compris `api.php`. La configuration dans **Comptes & accès → Configuration du serveur mobile** ne publie pas Wamp. La compilation et la synchronisation se font avec `npm --prefix mobile run sync`. Android nécessite le SDK/JDK ; le projet iPhone natif reste une option future nécessitant Mac et signature Apple. Pour iPhone, utiliser aujourd’hui la PWA. La compilation ne remplace pas un essai GPS réel.

Les commandes d’installation, de compilation et les essais à réaliser sur les téléphones sont détaillés dans [la notice mobile](mobile/README.md).

### Import depuis UTM Geo Map

L’import est un complément facultatif pour les anciens tracés : il n’intervient pas dans la collecte passive. Dans UTM Geo Map, exporter uniquement la ligne de la course en **GPX, KML ou GeoJSON**, avec les coordonnées WGS84 (longitude/latitude dans les fichiers KML/GeoJSON). Dans la carte de la course, ouvrir **Importer un ancien tracé (facultatif)**, choisir le fichier, vérifier son aperçu, puis **Rattacher ce tracé à la course**. L’échange utilise les [formats d’export documentés par UTM Geo Map](https://www.utmgeomap.com/export_file.html) ; DriverMan ne pilote pas directement le GPS de cette autre application.

Les segments, coordonnées et horaires présents sont conservés. Les fichiers sans horaires restent utilisables, avec une indication explicite : leurs heures de passage ne peuvent pas être vérifiées. Si des horaires sont présents, ils doivent être inclus dans la course choisie. Les déclarations XML externes, coordonnées hors limites, polygones et formats incorrects sont refusés. Limites : 2 Mo / 20 000 points par fichier, 20 fichiers / 100 000 points importés par course. Un nouvel envoi du même fichier ne crée pas de doublon. L’administrateur peut importer pour toute course ; un chauffeur uniquement pour les siennes.

Les imports sont enregistrés dans MySQL, séparément du GPS du téléphone. Le sélecteur **Tracé affiché** permet de choisir leur provenance sans mélanger des fichiers aux heures inconnues avec les relevés natifs. Les archives restent disponibles après le retrait d’un véhicule ou chauffeur du parc et sont incluses dans la sauvegarde de la base.

### Générer la carte au retour

**Télécharger PDF** et **Télécharger JPEG** exportent directement la carte affichée, avec le véhicule, le chauffeur, la destination, les dates, la source et la distance entre relevés. Cadrer le trajet avant l’export. Le fond OpenStreetMap déjà chargé est intégré au document : aucune connexion n’est nécessaire pour ouvrir le fichier obtenu. L’export réutilise uniquement les images de la vue courante ; il ne précharge pas d’autres zones. Un fond manquant ou bloqué empêche la génération. Sur Android, le menu de partage permet d’enregistrer le document ou de choisir sa destination.

Les portions GPS sont en trait plein. Une liaison bleue en pointillés relie les segments séparés : elle est indicative et ne reconstitue pas les rues réellement parcourues. Elle n’est ajoutée ni aux kilomètres mesurés, ni aux fichiers GPX/KML. Ces derniers conservent les segments et horaires d’origine.

**Exporter GPX / Exporter KML** produit aussi un fichier GPS réutilisable. La carte du suivi passif relie les relevés espacés de quinze secondes. Android 1.1 démarre un nouveau segment après une interruption GPS de plus d’une minute. Un changement de session GPS ou un saut incompatible avec un déplacement automobile sépare aussi les segments. La carte conserve le seuil de 10 minutes 30 secondes pour les anciens relevés espacés de cinq minutes ; les imports externes gardent leur seuil de deux minutes. Le tracé entre relevés est approximatif et ne décrit pas tous les virages parcourus entre deux points. La distance mesurée ne remplace pas le compteur du véhicule. Les fichiers téléchargés contiennent les données de la course choisie.

## Données et configuration

PHP **8.2 ou supérieur**, avec `pdo_mysql`, `mbstring`, `session`, `dom`/`libxml` pour les imports GPS et `gd` pour les photos (`exif` recommandé pour leur orientation). Configurer `upload_max_filesize` à au moins `2M` et `post_max_size` à au moins `3M`. Les dépendances front-end sont compilées et incluses dans `assets/` : Node.js n’est pas nécessaire pour utiliser l’application. Le fond de carte OpenStreetMap nécessite une connexion Internet.

Le parc réel utilise la base **MySQL `driverman`**, sur `127.0.0.1:3306` (MySQL 8.4 minimum, tables InnoDB et UTF-8 complet). La connexion est définie dans **`C:\wamp64\driverman-data\database.json`**, hors du dossier web. Chaque démonstration possède une base MySQL distincte `driverman_demo_<identifiant de session>`. Aucun repli vers SQLite n’est effectué. Voir [configuration et migration MySQL](docs/mysql.md).

Variables d’environnement facultatives, à définir dans la configuration du serveur PHP/Apache :

- `DRIVERMAN_DATA_DIR` : répertoire inscriptible par le serveur, à conserver en dehors de la racine web.
- `DRIVERMAN_TIMEZONE` : fuseau horaire de l’application, par défaut `Africa/Lagos` (UTC+1).

Sauvegarder la base MySQL avec `mysqldump --single-transaction --hex-blob` ainsi que la configuration privée avant un transfert. Les anciennes bases SQLite ne servent que de sauvegarde historique. Le compte Apache doit avoir le droit d’y écrire. Les fichiers `.htaccess` protègent les dossiers de code interne et désactivent l’indexation. Pour un hébergement au-delà du réseau local, configurer HTTPS.

## Développement et vérification

```powershell
npm ci
npm run build
npm run check
npm test
```

`npm run build` compile les composants daisyUI et le thème TELESOL, puis copie Alpine CSP en local. Le thème se trouve dans `src/theme.css`, la mise en page dans `assets/style.css`, l’accueil dans `assets/entry.css`, l’identité de l’espace connecté dans `assets/workspace.css`, les composants et parcours dans `assets/app.js`.

Les tests `reports.mjs` vérifient les limites de mois, les courses à cheval sur deux mois, les devises, les pleins antérieurs à la période, les véhicules retirés et la relecture des exports Excel. Ils génèrent aussi des PDF simples et multipages. `pwa.mjs` vérifie les scénarios de première visite, installation, refus, détection, stockage privé, les dimensions des icônes et l’exclusion des données privées du cache. Les exports et leurs styles se trouvent dans `assets/report-*.js` et `assets/reports.css` ; l’installation dans `assets/pwa.js`, `manifest.webmanifest` et `sw.js`.

Les tests d’intégration lancent leur propre serveur PHP sur un port libre et des bases MySQL temporaires isolées, supprimées après les tests. MySQL doit fonctionner ; les paramètres administrateur de test sont décrits dans `docs/mysql.md`. Ils vérifient l’authentification, les validations métier, l’isolation de la démonstration, les autorisations des deux rôles, les photos (ajout, remplacement, suppression, format, taille, confidentialité et persistance), les types personnalisés et le changement du mot de passe personnel. Sur Wamp, PHP 8 est détecté automatiquement ; ailleurs, utiliser `PHP_BIN` si PHP n’est pas dans le PATH.

## Identité et ressources

- Logo officiel récupéré sur [telesol.net](https://telesol.net/images/logo/telesol-logo.png), conservé dans `assets/telesol-logo.png`. Variante blanche : `assets/telesol-logo-white.png`.
- Photographie créée puis modifiée avec l’outil intégré ImageGen, dans `assets/fleet-driver-gps.png`, avec une carte GPS et un itinéraire orange en arrière-plan. Les prompts complets et la provenance se trouvent dans `assets/image-generation.txt` et `assets/image-gps-prompt.txt`.
- Gros plan de phare en couleur créé avec l’outil intégré ImageGen dans `assets/headlight-color.png`. Prompt final dans `assets/headlight-prompt.txt`.
- Typographie Manrope conservée localement. Licences Manrope, Alpine.js et daisyUI dans `assets/licenses/`.

Les données de démonstration sont fictives.

## Notifications administrateur

Le menu **Notifications** permet de choisir les départs et achats de carburant, avec son, vibration, les deux ou en silence. Le serveur conserve un historique personnel et une file d’envoi. Le guide [notifications](docs/notifications.md) détaille Web Push pour la PWA iPhone, la configuration Firebase nécessaire pour Android fermé, le worker de reprise et les tests sur téléphone. Firebase et le domaine public restent à configurer ; l’APK 1.3 signale cette étape manquante.
