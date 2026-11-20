<?php
declare(strict_types=1);

// Read configuration as data, never as executable PHP or shell commands.
(function (): void {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;
    $envFile = dirname(__DIR__) . '/.env';
    if (!is_file($envFile)) return;
    foreach (file($envFile, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        if (!preg_match('/^\s*(HORROR_HUB_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/', $line, $match) || getenv($match[1]) !== false) {
            continue;
        }
        $value = $match[2];
        if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }
        putenv($match[1] . '=' . $value);
    }
})();

/** Public site address from HORROR_HUB_SITE_URL, e.g. https://example.com; empty when not configured. */
function hh_site_url(): string {
    $value = trim((string)getenv('HORROR_HUB_SITE_URL'));
    if ($value === '') return '';
    $parts = parse_url($value);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host'])
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
        return '';
    }
    return rtrim($value, '/');
}

/** Site address for absolute links: the configured one, otherwise derived from the current request. */
function hh_public_base_url(): string {
    $configured = hh_site_url();
    if ($configured !== '') return $configured;
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (!preg_match('/^(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d{1,5})?$|^\[[0-9a-f:]+\](?::\d{1,5})?$/i', $host)) $host = 'localhost';
    $https = isset($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    $directory = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    $directory = preg_match('#^[A-Za-z0-9_./-]*$#', $directory) ? rtrim($directory, '/.') : '';
    return ($https ? 'https' : 'http') . '://' . strtolower($host) . $directory;
}
