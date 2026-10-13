<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'self'");
$release = null;
$metadata = __DIR__ . '/downloads/android.json';
if (is_file($metadata)) {
    $candidate = json_decode((string)file_get_contents($metadata), true);
    if (is_array($candidate) && is_string($candidate['file'] ?? null)
        && preg_match('/^DriverMan-Android-[0-9]+(?:\.[0-9]+)*\.apk$/D', $candidate['file'])
        && is_string($candidate['version'] ?? null) && is_int($candidate['bytes'] ?? null)
        && $candidate['bytes'] > 0 && is_file(__DIR__ . '/downloads/' . $candidate['file'])
        && filesize(__DIR__ . '/downloads/' . $candidate['file']) === $candidate['bytes']) {
        $release = $candidate;
    }
}
$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$asset = static fn(string $file): string => 'assets/' . $file . '?v=' . substr(hash_file('sha256', __DIR__ . '/assets/' . $file), 0, 12);
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#1b212c">
  <meta name="description" content="Téléchargez DriverMan pour Android et retrouvez votre espace administrateur ou chauffeur sur votre téléphone.">
  <title>Application Android — DriverMan TELESOL</title>
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
  <link rel="stylesheet" href="<?= $asset('android.css') ?>">
</head>
<body>
  <div class="android-page">
    <header><a class="brand" href="./" aria-label="Accueil DriverMan"><img src="assets/telesol-logo-white.png" width="108" alt="TELESOL"><span>DriverMan<span class="accent">.</span></span></a><a class="back-link" href="./">Retour à l’application web <span aria-hidden="true">↗</span></a></header>
    <main>
      <section class="download-card" aria-labelledby="download-title">
        <div class="app-heading"><img class="app-icon" src="assets/pwa/icon-192.png" width="76" height="76" alt=""><div><p class="eyebrow">DRIVERMAN TELESOL</p><p class="platform">Application Android · APK</p></div></div>
        <h1 id="download-title">Votre parc vous accompagne.</h1>
        <p class="intro">Installez DriverMan sur votre téléphone Android et connectez-vous avec votre compte administrateur ou chauffeur.</p>
        <?php if ($release): ?>
          <p class="release">Version <?= $escape($release['version']) ?><?= ($release['channel'] ?? '') === 'test' ? ' · Version de test' : '' ?> <span>·</span> <?= number_format($release['bytes'] / 1024 / 1024, 1, ',', ' ') ?> Mo</p>
          <a class="download-button" href="downloads/<?= $escape($release['file']) ?>" download="<?= $escape($release['file']) ?>"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>Télécharger l’APK Android</a>
          <p class="hint">Ouvrez cette page sur le téléphone à installer. Le téléchargement ne lance pas l’installation automatiquement.</p>
        <?php else: ?>
          <p class="unavailable" role="status">L’APK n’est pas encore disponible sur ce serveur. Contactez votre administrateur ou réessayez plus tard.</p>
        <?php endif; ?>
        <div class="features"><p><strong>Administrateur</strong>Gérez le parc, les comptes, le carburant et les rapports.</p><p><strong>Chauffeur</strong>Retrouvez vos missions et activez le suivi GPS pendant vos courses.</p></div>
        <p class="server-note">Serveur préconfiguré : <a href="https://driverman.trackkintrans.com/">driverman.trackkintrans.com</a>. La connexion nécessite que le serveur soit en ligne.</p>
      </section>
      <section class="installation" aria-labelledby="install-title">
        <p class="eyebrow">PRISE EN MAIN</p><h2 id="install-title">Installer en quelques étapes</h2>
        <ol>
          <li><strong>Téléchargez et ouvrez le fichier</strong><p>Touchez le bouton de téléchargement, puis ouvrez le fichier APK dans les téléchargements de votre téléphone.</p></li>
          <li><strong>Confirmez sur Android</strong><p>Si Android le demande, autorisez l’installation depuis le navigateur ou l’application qui ouvre ce fichier, puis touchez « Installer ».</p></li>
          <li><strong>Connectez-vous à DriverMan</strong><p>Ouvrez l’application et utilisez vos identifiants habituels. Votre compte détermine automatiquement votre espace.</p></li>
        </ol>
        <div class="gps-note"><h3>Pour le suivi des courses</h3><p>Avec le compte chauffeur, activez « Suivi pendant mes courses » et autorisez la position précise ainsi que les notifications. Le suivi est prévu pour continuer écran verrouillé.</p></div>
        <p class="iphone-note"><strong>Vous utilisez un iPhone ?</strong> Ouvrez <a href="./">l’application web</a> dans Safari, puis choisissez « Partager → Sur l’écran d’accueil ». Le fichier APK est réservé à Android.</p>
      </section>
    </main>
    <footer>DriverMan · Gestion du parc automobile TELESOL</footer>
  </div>
</body>
</html>
