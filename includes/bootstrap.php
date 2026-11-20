<?php
declare(strict_types=1);
require_once __DIR__ . '/headers.php';
hh_security_headers(str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/admin/'));
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/env.php';

function hh_json(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

set_exception_handler(function (Throwable $error): void {
    error_log('Horror Hub: ' . $error->getMessage());
    if (str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/admin/')) {
        http_response_code(503);
        header('Content-Type: text/html; charset=utf-8');
        exit('<h1>Сервіс тимчасово недоступний</h1><p>Перевірте налаштування та журнал сервера.</p>');
    }
    hh_json(['status' => 'error', 'message' => 'Сервіс тимчасово недоступний. Спробуйте пізніше.'], 503);
});

if (session_status() !== PHP_SESSION_ACTIVE) {
    $sessions = dirname(__DIR__) . '/storage/sessions';
    if (!is_dir($sessions) && !mkdir($sessions, 0700, true) && !is_dir($sessions)) throw new RuntimeException('Cannot create session storage');
    session_save_path($sessions);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('horror_hub_session');
    session_set_cookie_params([
        'path' => '/', 'httponly' => true, 'samesite' => 'Lax',
        'secure' => isset($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off'
    ]);
    if (!session_start()) throw new RuntimeException('Cannot start session');
}

function hh_input(array $source, string $key, bool $trim = true): string {
    $value = $source[$key] ?? '';
    if (!is_string($value) || str_contains($value, "\0") || !preg_match('//u', $value)) {
        hh_json(['status' => 'error', 'message' => 'Некоректний формат даних.'], 422);
    }
    return $trim ? trim($value) : $value;
}

function hh_length(string $value): int {
    return preg_match_all('/./us', $value) ?: 0;
}

function hh_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        header('Allow: ' . $method);
        hh_json(['status' => 'error', 'message' => 'Метод не підтримується.'], 405);
    }
}

function hh_csrf_token(): string {
    return $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
}

function hh_check_csrf(): void {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? '');
    if (!is_string($token) || $token === '' || !hash_equals(hh_csrf_token(), $token) || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        hh_json(['status' => 'error', 'message' => 'Оновіть сторінку та повторіть запит.'], 403);
    }
}

function hh_destroy_session(): void {
    $_SESSION = [];
    $options = session_get_cookie_params();
    unset($options['lifetime']);
    setcookie(session_name(), '', ['expires' => time() - 3600] + $options);
    session_destroy();
}

function hh_db(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $host = getenv('HORROR_HUB_DB_HOST') ?: '127.0.0.1';
    $port = getenv('HORROR_HUB_DB_PORT') ?: '3306';
    $name = getenv('HORROR_HUB_DB_NAME') ?: 'horror_hub';
    if (!preg_match('/^[a-zA-Z0-9.:-]+$/', $host) || !ctype_digit($port) || !preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
        throw new RuntimeException('Invalid database configuration');
    }
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", getenv('HORROR_HUB_DB_USER') ?: 'root', getenv('HORROR_HUB_DB_PASSWORD') ?: '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 3
    ]);
    return $pdo;
}

function hh_current_user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $stmt = hh_db()->prepare('SELECT id, username, avatar, role, is_banned, password FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || !empty($user['is_banned'])) {
        unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['username'], $_SESSION['avatar']);
        return null;
    }
    return $user;
}

function hh_rate_limit(string $bucket, int $limit, int $window): void {
    $directory = dirname(__DIR__) . '/storage/rate_limits';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Cannot create rate limit storage');
    }
    $file = $directory . '/' . hash('sha256', $bucket . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'local')) . '.json';
    $handle = fopen($file, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) throw new RuntimeException('Cannot lock rate limit storage');
    try {
        $state = json_decode(stream_get_contents($handle), true);
        $now = time();
        if (!is_array($state) || ($state['expires'] ?? 0) <= $now) $state = ['count' => 0, 'expires' => $now + $window];
        $state['count']++;
        $encoded = json_encode($state, JSON_THROW_ON_ERROR);
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) throw new RuntimeException('Cannot save rate limit');
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    if ($state['count'] > $limit) {
        header('Retry-After: ' . max(1, $state['expires'] - $now));
        hh_json(['status' => 'error', 'message' => 'Забагато запитів. Спробуйте трохи пізніше.'], 429);
    }
}

function hh_safe_url(string $value, bool $mailto = false): bool {
    if (preg_match('/[\x00-\x20\\\\]/', $value)) return false;
    $parts = parse_url($value);
    if (!$parts || isset($parts['user']) || isset($parts['pass'])) return false;
    if ($mailto && ($parts['scheme'] ?? '') === 'mailto') return (bool)filter_var($parts['path'] ?? '', FILTER_VALIDATE_EMAIL);
    return in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) && (bool)filter_var($value, FILTER_VALIDATE_URL);
}

function hh_local_path(string $value, string $directory, array $extensions): bool {
    $decoded = rawurldecode($value);
    if (!str_starts_with($decoded, $directory . '/') || preg_match('/[\x00-\x20\\\\?#:]/', $decoded)) return false;
    foreach (explode('/', $decoded) as $part) if ($part === '' || $part === '.' || $part === '..') return false;
    $root = realpath(dirname(__DIR__) . '/' . $directory);
    $path = realpath(dirname(__DIR__) . '/' . $decoded);
    return $root !== false && $path !== false && is_file($path) && str_starts_with(strtolower($path), strtolower($root . DIRECTORY_SEPARATOR)) && in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), $extensions, true);
}
