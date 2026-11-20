<?php
declare(strict_types=1);
// Sends 404.html for any missing address. The <base> tag points at the site folder,
// so the page keeps its styles both at the domain root and in a subfolder such as /Horror_Hub/.
require_once __DIR__ . '/includes/headers.php';
hh_security_headers();

$base = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/404.php'))), '/.') . '/';
if (!preg_match('#^/[A-Za-z0-9_./~-]*$#', $base) || str_contains($base, '..')) $base = '/';

http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo str_replace('<base href="./">', '<base href="' . htmlspecialchars($base, ENT_QUOTES, 'UTF-8') . '">', (string)file_get_contents(__DIR__ . '/404.html'));
