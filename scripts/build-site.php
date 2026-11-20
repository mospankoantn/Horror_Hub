<?php
declare(strict_types=1);
/*
 * Generates static article pages, local covers and data/pages.json.
 *   C:\xampp\php\php.exe -d extension=gd scripts/build-site.php [--offline] [--no-covers]
 * --offline    do not contact Telegraph or image hosts (uses only local copies)
 * --no-covers  keep external cover URLs as they are
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/includes/site_builder.php';

$arguments = array_slice($argv, 1);
$offline = in_array('--offline', $arguments, true);
if (!function_exists('imagewebp')) {
    fwrite(STDERR, "Увага: розширення GD не завантажене, обкладинки збережуться без стиснення. Запускайте з -d extension=gd.\n");
}
if (hh_site_url() === '') {
    fwrite(STDERR, "Увага: HORROR_HUB_SITE_URL не задано у .env — canonical, og:url і og:image не будуть додані.\n");
}

$started = microtime(true);
$stats = hh_build_site([
    'fetch_missing' => !$offline,
    'download_covers' => !$offline && !in_array('--no-covers', $arguments, true),
    'log' => static function (string $message): void { echo $message, PHP_EOL; },
]);
foreach ($stats['warnings'] as $warning) fwrite(STDERR, "! $warning\n");
printf("Готово за %.1f с.\n", microtime(true) - $started);
exit($stats['pages'] > 0 ? 0 : 1);
