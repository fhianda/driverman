<?php
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
header('Cache-Control: no-store');
// A changed asset gets a new URL, even when a browser has cached the old file.
// Keep this in the PHP block so the packaged mobile HTML stays static.
ob_start(static function (string $html): string {
    return preg_replace_callback('~\b(src|href)="(assets/[^"?]+\.(?:css|js))"~', static function (array $match): string {
        $version = substr(hash_file('sha256', __DIR__ . '/' . $match[2]), 0, 12);
        return $match[1] . '="' . $match[2] . '?v=' . $version . '"';
    }, $html) ?? $html;
});
?>
<!DOCTYPE html>
<html lang="fr" data-theme="telesol">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#1b212c">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="DriverMan">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="assets/pwa/icon-192.png">
  <meta name="description" content="DriverMan TELESOL — gérez vos chauffeurs, votre parc automobile et chaque mouvement de vos véhicules depuis un seul espace.">
  <title>DriverMan TELESOL — Votre parc, en mouvement.</title>
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
  <link rel="stylesheet" href="assets/components.css">
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/startup.css">
  <link rel="stylesheet" href="assets/entry.css">
  <link rel="stylesheet" href="assets/workspace.css">
  <link rel="stylesheet" href="assets/cards.css">
  <link rel="stylesheet" href="assets/fuel.css">
  <link rel="stylesheet" href="assets/reports.css">
  <link rel="stylesheet" href="assets/pwa.css">
  <link rel="stylesheet" href="assets/notifications.css">
  <link rel="stylesheet" href="assets/vendor/leaflet.css">
  <link rel="stylesheet" href="assets/tracking.css">
  <script src="assets/pwa.js" defer></script>
  <script src="assets/fuel-metrics.js" defer></script>
  <script src="assets/geo.js" defer></script>
  <script src="assets/vendor/leaflet.js" defer></script>
  <script src="assets/route-files.js" defer></script>
  <script src="assets/tracking.js" defer></script>
  <script src="assets/fuel-ui.js" defer></script>
  <script src="assets/report-metrics.js" defer></script>
  <script src="assets/report-export.js" defer></script>
  <script src="assets/report-ui.js" defer></script>
  <script src="assets/notifications.js" defer></script>
  <script src="assets/reset.js" defer></script>
  <script src="assets/app.js" defer></script>
  <script src="assets/login-focus.js" defer></script>
  <script src="assets/alpine-csp.min.js" defer></script>
</head>
<body>
  <div id="app"><div class="boot startup" role="status" aria-label="Chargement de DriverMan"><div class="startup-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M38 14v36H27a13 13 0 1 1 11-20" stroke="white" stroke-width="6"/><path d="M43 16h9v9m-1-8L40 28" stroke="#fa955f" stroke-width="3"/></svg></div><strong class="startup-name">DriverMan<span>.</span></strong><img class="startup-brand" src="assets/telesol-logo-white.png" width="150" height="49" alt="TELESOL"><span class="sr-only">Chargement de l’application…</span></div></div>
  <dialog id="modal" aria-labelledby="modal-title"></dialog>
  <div id="toast" role="status" aria-live="polite"></div>
  <noscript>Activez JavaScript dans votre navigateur pour utiliser DriverMan.</noscript>
</body>
</html>
