<?php
// This fixture connects only to the isolated test instance, never to site config.
$pdo = new PDO('mysql:host=127.0.0.1;port=3311;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$data = str_replace('\\', '/', (string)$pdo->query('SELECT @@datadir')->fetchColumn());
$expected = str_replace('\\', '/', dirname(__DIR__) . '/storage/test-db/');
if (strtolower(rtrim($data, '/')) !== strtolower(rtrim($expected, '/'))) throw new RuntimeException('Not the isolated test database');
$mode = $argv[1] ?? '';
if ($mode === 'init') {
    $schema = str_replace('horror_hub', 'horror_hub_test', file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
    $pdo->exec($schema);
    echo "Test schema ready\n";
    exit;
}
$pdo->exec('USE horror_hub_test');
$email = $argv[2] ?? '';
if (!str_starts_with($email, 'codex-test-') || !str_ends_with($email, '@example.test')) throw new RuntimeException('Not a fixture user');
if ($mode === 'ban') $pdo->prepare('UPDATE users SET is_banned = 1 WHERE email = ?')->execute([$email]);
elseif ($mode === 'promote') $pdo->prepare("UPDATE users SET role = 'admin' WHERE email = ?")->execute([$email]);
elseif ($mode === 'revoke') $pdo->prepare("UPDATE users SET role = 'user' WHERE email = ?")->execute([$email]);
elseif ($mode === 'verify') {
    $stmt = $pdo->prepare('SELECT password FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $hash = $stmt->fetchColumn();
    echo json_encode(['hashed' => password_verify('New-password-456', $hash)]);
} else throw new RuntimeException('Unknown fixture action');
