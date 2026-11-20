<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/headers.php';
$root = realpath(dirname(__DIR__));
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rawurldecode(is_string($requestPath) ? $requestPath : '/');
hh_security_headers(str_starts_with($path, '/admin/'));
if (preg_match('#^/(articles|content)/#', $path)) header('X-Robots-Tag: noindex');
if ($path === '/__health') {
    header('Content-Type: application/json');
    echo json_encode(['site' => 'horror-hub', 'root' => hash('sha256', $root)]);
    return true;
}
$generated = ['/sitemap.xml' => '/sitemap.php', '/robots.txt' => '/robots.php'];
if (isset($generated[$path])) {
    $_SERVER['SCRIPT_NAME'] = $generated[$path];
    $_SERVER['SCRIPT_FILENAME'] = $root . $generated[$path];
    require $root . $generated[$path];
    return true;
}
$parts = explode('/', trim($path, '/'));
$private = ['includes', 'dev', 'tests', 'scripts', 'storage', 'messages', 'database', 'node_modules', 'vendor', 'мусор'];
$blocked = preg_match('/[\x00-\x1f\\\\]/', $path);
foreach ($parts as $part) {
    $lower = function_exists('mb_strtolower') ? mb_strtolower($part) : strtolower($part);
    if ($part === '..' || str_starts_with($part, '.') || in_array($lower, $private, true) || $part === 'Мусор') $blocked = true;
}
$extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if (in_array($extension, ['log', 'jsonl', 'sql', 'ini', 'toml', 'md', 'txt', 'cmd', 'bat', 'ps1', 'bak', 'env'], true) || basename($path) === 'db.php') $blocked = true;
$file = realpath($root . ($path === '/' ? '/index.html' : $path));
if ($blocked || !$file || !is_file($file) || !str_starts_with(strtolower($file), strtolower($root . DIRECTORY_SEPARATOR))) {
    http_response_code($blocked ? 403 : 404);
    if (!$blocked && is_file($root . '/404.php')) {
        $_SERVER['SCRIPT_NAME'] = '/404.php';
        require $root . '/404.php';
        return true;
    }
    header('Content-Type: text/plain; charset=utf-8');
    echo $blocked ? 'Access denied' : 'Not found';
    return true;
}
if ($extension === 'php') {
    if (!in_array($path, ['/api_auth.php', '/api_comments.php', '/api_games.php', '/save_contact.php', '/admin/admin.php'], true)) {
        http_response_code(403);
        return true;
    }
    $_SERVER['SCRIPT_NAME'] = $path;
    $_SERVER['SCRIPT_FILENAME'] = $file;
    require $file;
    return true;
}
$types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'json' => 'application/json; charset=utf-8', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'ico' => 'image/x-icon', 'woff2' => 'font/woff2', 'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav'];
if (!isset($types[$extension]) && $path !== '/') {
    http_response_code(403);
    return true;
}
header('Content-Type: ' . ($types[$extension] ?? $types['html']));
header('Cache-Control: no-cache');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') return true;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    return true;
}
readfile($file);
return true;
