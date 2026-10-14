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
        <img class="app-icon" src="assets/pwa/icon-192.png" width="76" height="76" alt="">
        <h1 id="download-title">DriverMan pour Android</h1>
        <?php if ($release): ?>
          <p class="release">Version <?= $escape($release['version']) ?> · <?= number_format($release['bytes'] / 1024 / 1024, 1, ',', ' ') ?> Mo</p>
          <a class="download-button" href="downloads/<?= $escape($release['file']) ?>" download="<?= $escape($release['file']) ?>"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>Télécharger l’APK Android</a>
        <?php else: ?>
          <p class="unavailable" role="status">Téléchargement momentanément indisponible.</p>
        <?php endif; ?>
      </section>
    </main>
  </div>
</body>
</html>
