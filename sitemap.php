<?php
declare(strict_types=1);
// Served as /sitemap.xml (see .htaccess and dev/router.php). Built from data/pages.json.
require_once __DIR__ . '/includes/env.php';
require_once __DIR__ . '/includes/headers.php';
hh_security_headers();

$base = hh_public_base_url();
$manifest = json_decode((string)@file_get_contents(__DIR__ . '/data/pages.json'), true);
$pages = is_array($manifest['pages'] ?? null) ? $manifest['pages'] : [];
$static = is_array($manifest['static'] ?? null) ? $manifest['static'] : ['index.html', 'articles.html'];

$entries = [];
foreach ($static as $page) {
    if (!is_string($page) || !preg_match('/^[a-z0-9_]+\.html$/', $page) || !is_file(__DIR__ . '/' . $page)) continue;
    $entries[] = [$page === 'index.html' ? '' : $page, gmdate('Y-m-d', (int)filemtime(__DIR__ . '/' . $page))];
}
foreach ($pages as $page) {
    if (!empty($page['stub'])) continue; // stub pages are noindex
    $path = (string)($page['path'] ?? '');
    if (!preg_match('#^statti/[a-z0-9-]+\.html$#', $path) || !is_file(__DIR__ . '/' . $path)) continue;
    $lastmod = (string)($page['lastmod'] ?? '');
    $entries[] = [$path, preg_match('/^\d{4}-\d{2}-\d{2}$/', $lastmod) ? $lastmod : ''];
}

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo '<?xml version="1.0" encoding="UTF-8"?>', "\n", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', "\n";
foreach ($entries as [$path, $lastmod]) {
    echo '  <url><loc>', htmlspecialchars($base . '/' . $path, ENT_XML1 | ENT_QUOTES, 'UTF-8'), '</loc>';
    if ($lastmod !== '') echo '<lastmod>', $lastmod, '</lastmod>';
    echo "</url>\n";
}
echo "</urlset>\n";
