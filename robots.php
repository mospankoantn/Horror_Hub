<?php
declare(strict_types=1);
// Served as /robots.txt (see .htaccess and dev/router.php).
require_once __DIR__ . '/includes/env.php';
require_once __DIR__ . '/includes/headers.php';
hh_security_headers();

$base = hh_public_base_url();
$prefix = rtrim((string)parse_url($base, PHP_URL_PATH), '/');

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=3600');
$lines = ['User-agent: *'];
// Service pages and raw article sources: the full text lives in /statti/. The old article.html stays crawlable
// so search engines can see its noindex tag and the redirect to the static page.
foreach (['/admin/', '/api_auth.php', '/api_comments.php', '/save_contact.php', '/login.html', '/profile.html',
    '/articles/', '/content/'] as $path) {
    $lines[] = 'Disallow: ' . $prefix . $path;
}
$lines[] = '';
$lines[] = 'Sitemap: ' . $base . '/sitemap.xml';
echo implode("\n", $lines), "\n";
